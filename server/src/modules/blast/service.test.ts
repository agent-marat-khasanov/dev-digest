import { describe, it, expect } from 'vitest';
import type { Container } from '../../platform/container.js';
import type { PullRow } from '../reviews/repository.js';
import { NotFoundError } from '../../platform/errors.js';
import type { BlastResult, ReachableFacts } from '../repo-intel/types.js';
import { BlastService } from './service.js';

/**
 * Hermetic unit tests for BlastService. The service reads through container.git
 * (diff), container.reviewRepo (pull/repo), and container.repoIntel
 * (getBlastRadius + getReachableFacts). We fake those ports and assert the
 * composed BlastRadius transport: caller grouping by changed symbol, the
 * ТЗ-step-2 rank-sort + 20-cap, and endpoint/cron attribution (caller-file facts
 * ∪ depth-2 reachable). No Postgres, no LLM.
 */

const WS = 'ws1';
const PR = 'pr1';
const REPO = 'repo1';

function makeContainer(opts: {
  pull?: boolean;
  changedFiles?: string[];
  blast?: BlastResult;
  reachable?: Record<string, ReachableFacts>;
}): Container {
  const files = (opts.changedFiles ?? ['src/rate-limit.ts']).map((path) => ({ path }));
  return {
    git: {
      diff: async () => ({ files, raw: '' }),
    },
    reviewRepo: {
      getPull: async () =>
        opts.pull === false
          ? undefined
          : ({ id: PR, repoId: REPO, base: 'main', headSha: 'sha' } as PullRow),
      getRepo: async () => ({ owner: 'acme', name: 'api' }),
      getPrFiles: async () => [],
    },
    repoIntel: {
      getBlastRadius: async (): Promise<BlastResult> =>
        opts.blast ?? { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: false },
      getReachableFacts: async (): Promise<Record<string, ReachableFacts>> => opts.reachable ?? {},
    },
  } as unknown as Container;
}

describe('BlastService.getBlast', () => {
  it('throws NotFoundError when the PR does not exist', async () => {
    const service = new BlastService(makeContainer({ pull: false }));
    await expect(service.getBlast(WS, PR)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('groups callers under their changed symbol and attributes endpoints/crons', async () => {
    const blast: BlastResult = {
      changedSymbols: [{ file: 'src/rate-limit.ts', name: 'rateLimit', kind: 'function' }],
      callers: [
        { file: 'src/api/items.ts', symbol: 'listItems', viaSymbol: 'rateLimit', line: 23, rank: 5 },
        { file: 'src/api/hooks.ts', symbol: 'onHook', viaSymbol: 'rateLimit', line: 45, rank: 9 },
      ],
      impactedEndpoints: ['GET /api/items'],
      factsByFile: {
        'src/api/items.ts': { endpoints: ['GET /api/items'], crons: [] },
        'src/api/hooks.ts': { endpoints: ['POST /api/hooks'], crons: [] },
      },
      degraded: false,
    };
    const reachable = {
      'src/rate-limit.ts': { endpoints: ['GET /api/health'], crons: ['reset-buckets (hourly)'] },
    };
    const service = new BlastService(makeContainer({ blast, reachable }));

    const result = await service.getBlast(WS, PR);

    expect(result.changed_symbols).toEqual([
      { name: 'rateLimit', file: 'src/rate-limit.ts', kind: 'function' },
    ]);
    expect(result.downstream).toHaveLength(1);
    const d = result.downstream[0]!;
    expect(d.symbol).toBe('rateLimit');
    // Sorted by rank DESC: rank 9 before rank 5.
    expect(d.callers.map((c) => c.name)).toEqual(['onHook', 'listItems']);
    expect(d.callers[0]).toEqual({ name: 'onHook', file: 'src/api/hooks.ts', line: 45 });
    // Endpoints = union of caller-file facts (1-hop) ∪ depth-2 reachable.
    expect(new Set(d.endpoints_affected)).toEqual(
      new Set(['GET /api/items', 'POST /api/hooks', 'GET /api/health']),
    );
    expect(d.crons_affected).toEqual(['reset-buckets (hourly)']);
    expect(result.summary).toContain('1 changed symbol');
  });

  it('caps callers at 20 per symbol, keeping the highest-ranked', async () => {
    const callers = Array.from({ length: 25 }, (_, i) => ({
      file: `src/c${i}.ts`,
      symbol: `caller${i}`,
      viaSymbol: 'hot',
      line: i + 1,
      rank: i, // ascending rank; the top 20 by rank are 24..5
    }));
    const blast: BlastResult = {
      changedSymbols: [{ file: 'src/hot.ts', name: 'hot', kind: 'function' }],
      callers,
      impactedEndpoints: [],
      factsByFile: {},
      degraded: false,
    };
    const service = new BlastService(makeContainer({ blast }));

    const result = await service.getBlast(WS, PR);
    const d = result.downstream[0]!;

    expect(d.callers).toHaveLength(20);
    expect(d.callers[0]!.name).toBe('caller24'); // highest rank first
    expect(d.callers.some((c) => c.name === 'caller0')).toBe(false); // lowest rank dropped
  });

  it('returns an empty map with a plain summary when nothing is indexed', async () => {
    const service = new BlastService(
      makeContainer({ blast: { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true, reason: 'no_data' } }),
    );
    const result = await service.getBlast(WS, PR);

    expect(result.changed_symbols).toEqual([]);
    expect(result.downstream).toEqual([]);
    expect(result.summary).toMatch(/no indexed symbols/i);
  });
});
