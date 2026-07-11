import type { BlastCaller, BlastRadius, ChangedSymbol, DownstreamImpact } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { loadDiff } from '../reviews/diff-loader.js';

/** ТЗ step 2: cap the caller fan-out shown per changed symbol. */
const MAX_CALLERS_PER_SYMBOL = 20;

/**
 * Blast-radius service. Reads the pre-built repo-intel index ONLY — no LLM, no
 * parsing on the hot path:
 *   load PR + repo → changed files (from the diff) →
 *   repoIntel.getBlastRadius (changed symbols + direct callers + caller-file facts)
 *   + repoIntel.getReachableFacts (ТЗ step 3: depth-2 import-graph reachability) →
 *   assemble the shared BlastRadius transport.
 *
 * Degraded-safe: when the index is off/absent the facade returns an empty
 * best-effort result and this returns an empty map with a plain summary; the
 * route never throws for a missing index (the client surfaces the index state).
 */
export class BlastService {
  constructor(private container: Container) {}

  async getBlast(workspaceId: string, prId: string): Promise<BlastRadius> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const repoRow = await this.container.reviewRepo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repository not found');

    const diff = await loadDiff(this.container, this.container.reviewRepo, workspaceId, pull, repoRow);
    const changedFiles = diff.files.map((f) => f.path);

    const blast = await this.container.repoIntel.getBlastRadius(pull.repoId, changedFiles);
    const reachable = await this.container.repoIntel.getReachableFacts(pull.repoId, changedFiles);

    const changed_symbols: ChangedSymbol[] = blast.changedSymbols.map((s) => ({
      name: s.name,
      file: s.file,
      kind: s.kind,
    }));

    // Group callers by the changed symbol they reach.
    const callersByViaSymbol = new Map<string, typeof blast.callers>();
    for (const c of blast.callers) {
      const arr = callersByViaSymbol.get(c.viaSymbol);
      if (arr) arr.push(c);
      else callersByViaSymbol.set(c.viaSymbol, [c]);
    }

    const downstream: DownstreamImpact[] = blast.changedSymbols.map((sym) => {
      // ТЗ step 2: sort by file rank desc, cap at 20 (decl file already excluded
      // by the facade on both the persistent and ripgrep paths).
      const rows = (callersByViaSymbol.get(sym.name) ?? [])
        .slice()
        .sort((a, b) => b.rank - a.rank)
        .slice(0, MAX_CALLERS_PER_SYMBOL);

      const callers: BlastCaller[] = rows.map((c) => ({
        name: c.symbol,
        file: c.file,
        line: c.line,
      }));

      const endpoints = new Set<string>();
      const crons = new Set<string>();
      // (a) 1-hop: HTTP routes/crons declared in this symbol's caller files.
      for (const c of rows) {
        const ff = blast.factsByFile?.[c.file];
        if (!ff) continue;
        for (const e of ff.endpoints) endpoints.add(e);
        for (const cr of ff.crons) crons.add(cr);
      }
      // (b) ТЗ step 3: depth-2 reachable from the symbol's declaration file.
      const reach = reachable[sym.file];
      if (reach) {
        for (const e of reach.endpoints) endpoints.add(e);
        for (const cr of reach.crons) crons.add(cr);
      }

      return {
        symbol: sym.name,
        callers,
        endpoints_affected: [...endpoints],
        crons_affected: [...crons],
      };
    });

    return {
      changed_symbols,
      downstream,
      summary: buildSummary(changed_symbols, downstream),
    };
  }
}

/** Deterministic one-line summary — NO LLM call (ТЗ: zero model tokens). */
function buildSummary(symbols: ChangedSymbol[], downstream: DownstreamImpact[]): string {
  if (symbols.length === 0) return 'No indexed symbols found for the changed files.';
  const callerCount = downstream.reduce((n, d) => n + d.callers.length, 0);
  const endpointCount = new Set(downstream.flatMap((d) => d.endpoints_affected)).size;
  const cronCount = new Set(downstream.flatMap((d) => d.crons_affected)).size;
  return (
    `${symbols.length} changed symbol(s), ${callerCount} caller(s), ` +
    `${endpointCount} endpoint(s) and ${cronCount} cron(s) affected.`
  );
}
