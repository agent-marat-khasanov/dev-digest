import { describe, it, expect } from 'vitest';
import type { BlastRadius, SmartDiff } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import type { PullRow, RepoRow } from '../../db/rows.js';
import type { Container } from '../../platform/container.js';
import type { PrIntentRow } from '../intent/repository.js';
import {
  gatherArtifacts,
  enforceBudget,
  buildChangedFileSet,
  buildRiskRefSet,
  validateBrief,
  type PromptBlock,
} from './assemble.js';
import type { BriefModelOutput } from './prompt.js';

/**
 * Hermetic unit tests for the brief module's pure/orchestration helpers.
 * `gatherArtifacts` is exercised with a fully faked `Container` (fake Drizzle
 * `db` chain + fake `reviewRepo`/`repoIntel`/`github`/`agentsRepo`/
 * `contextRepo`) — no real Postgres, no fs, no model, per TESTING.md
 * ("mock the outside world").
 */

// ---------- fixtures ----------

const WS = 'ws1';
const PR_ID = 'pr1';
const REPO_ID = 'repo1';

function makePull(overrides: Partial<PullRow> = {}): PullRow {
  return {
    id: PR_ID,
    workspaceId: WS,
    repoId: REPO_ID,
    number: 1,
    title: 'Add rate limiting',
    author: 'marisa.koch',
    branch: 'feat/rl',
    base: 'main',
    headSha: 'sha-head',
    lastReviewedSha: null,
    additions: 10,
    deletions: 2,
    filesCount: 1,
    status: 'needs_review',
    body: null,
    openedAt: null,
    updatedAt: null,
    ...overrides,
  } as PullRow;
}

function makeRepo(overrides: Partial<RepoRow> = {}): RepoRow {
  return {
    id: REPO_ID,
    workspaceId: WS,
    owner: 'acme',
    name: 'payments-api',
    fullName: 'acme/payments-api',
    defaultBranch: 'main',
    clonePath: null,
    lastPolledAt: null,
    createdBy: null,
    createdAt: null,
    ...overrides,
  } as RepoRow;
}

const EMPTY_BLAST: BlastRadius = {
  changed_symbols: [],
  downstream: [],
  summary: '0 changed symbol(s), 0 caller(s), 0 endpoint(s) and 0 cron(s) affected.',
};

interface FakeContainerOpts {
  pull?: PullRow | undefined;
  repo?: RepoRow | undefined;
  intentRow?: PrIntentRow | null;
  blast?: BlastRadius;
  prFiles?: { path: string; additions: number; deletions: number; patch: string | null }[];
  reviews?: { review: { id: string }; findings: [] }[];
  getIssue?: (repo: unknown, n: number) => Promise<{ title: string; body: string | null }>;
  agents?: { id: string }[];
  agentContext?: Record<string, { path: string }[]>;
  inheritedContext?: Record<string, { path: string }[]>;
}

/** Builds a fake `Container` satisfying exactly the ports `gatherArtifacts` reads. */
function makeContainer(opts: FakeContainerOpts = {}): Container {
  const pull = opts.pull ?? makePull();
  const repo = opts.repo ?? makeRepo();
  const prFiles = opts.prFiles ?? [];

  const fakeDb = {
    select: (_cols?: unknown) => ({
      from: (table: unknown) => ({
        where: async () => {
          if (table === t.prIntent) return opts.intentRow ? [opts.intentRow] : [];
          return [];
        },
      }),
    }),
  };

  return {
    db: fakeDb,
    reviewRepo: {
      getPull: async (_ws: string, _id: string) => pull,
      getRepo: async (_id: string) => repo,
      getPrFiles: async (_id: string) => prFiles,
      reviewsForPull: async (_id: string) => opts.reviews ?? [],
    },
    repoIntel: {
      getBlastRadius: async () => ({ changedSymbols: [], callers: [], factsByFile: {} }),
      getReachableFacts: async () => ({}),
    },
    git: {
      diff: async () => {
        throw new Error('no real git in tests');
      },
    },
    github: async () => ({
      getIssue:
        opts.getIssue ??
        (async (_repo: unknown, n: number) => ({ title: `Issue #${n}`, body: 'issue body' })),
    }),
    agentsRepo: {
      list: async (_ws: string) => opts.agents ?? [],
    },
    contextRepo: {
      listAgentContext: async (agentId: string) => opts.agentContext?.[agentId] ?? [],
      skillInheritedContext: async (agentId: string) => opts.inheritedContext?.[agentId] ?? [],
    },
    tokenizer: { count: (text: string) => text.length },
  } as unknown as Container;
}

// If `opts.blast` was supplied, wire it through BlastService's dependency
// (getBlastRadius/getReachableFacts) — BlastService recomposes them into a
// BlastRadius, so tests that need a specific blast shape build one directly
// and assert on `gatherArtifacts`'s output rather than trying to inject the
// composed shape past BlastService.

// ---------- enforceBudget (AC-3 / AC-3a) ----------

describe('enforceBudget — 8000-token budget + fixed drop order (AC-3, AC-3a)', () => {
  const tokenizer = { count: (text: string) => text.length };

  function blocks(): PromptBlock[] {
    return [
      { label: 'intent_digest', body: 'x'.repeat(1000) }, // never dropped
      { label: 'blast_summary', body: 'x'.repeat(1000) }, // never dropped
      { label: 'blast_detail', body: 'x'.repeat(3000), dropTier: 4 },
      { label: 'smart_diff_detail', body: 'x'.repeat(3000), dropTier: 3 },
      { label: 'linked_issue', body: 'x'.repeat(3000), dropTier: 2 },
      { label: 'spec:a.md', body: 'x'.repeat(3000), dropTier: 1 },
    ];
  }

  it('stays within budget without dropping anything when already under 8000 tokens', () => {
    const small: PromptBlock[] = [
      { label: 'intent_digest', body: 'short' },
      { label: 'blast_summary', body: 'short' },
    ];
    const kept = enforceBudget(small, tokenizer);
    expect(kept).toEqual(small);
  });

  it('drops whole blocks in the fixed order specs -> issue -> smart-diff detail -> blast detail until under budget', () => {
    // total = 1000+1000+3000*4 = 14000, over 8000. Dropping spec (3000) ->
    // 11000, still over. Dropping issue (3000) -> 8000, exactly at budget ->
    // stop (while loop condition is `> BUDGET_TOKENS`).
    const kept = enforceBudget(blocks(), tokenizer);
    const labels = kept.map((b) => b.label);

    expect(labels).not.toContain('spec:a.md');
    expect(labels).not.toContain('linked_issue');
    expect(labels).toContain('smart_diff_detail');
    expect(labels).toContain('blast_detail');
    expect(labels).toContain('intent_digest');
    expect(labels).toContain('blast_summary');
  });

  it('NEVER drops the intent digest or the blast-radius summary, even when nothing droppable is left to reach budget', () => {
    // Both never-dropped blocks alone already exceed the budget.
    const oversized: PromptBlock[] = [
      { label: 'intent_digest', body: 'x'.repeat(5000) },
      { label: 'blast_summary', body: 'x'.repeat(5000) },
      { label: 'spec:a.md', body: 'x'.repeat(100), dropTier: 1 },
    ];
    const kept = enforceBudget(oversized, tokenizer);
    const labels = kept.map((b) => b.label);

    expect(labels).toEqual(['intent_digest', 'blast_summary']);
  });

  it('drops the lowest-tier droppable block first even when a higher-tier block is individually larger', () => {
    const mixed: PromptBlock[] = [
      { label: 'intent_digest', body: 'x'.repeat(10) },
      { label: 'blast_summary', body: 'x'.repeat(10) },
      { label: 'blast_detail', body: 'x'.repeat(20), dropTier: 4 },
      { label: 'spec:a.md', body: 'x'.repeat(8000), dropTier: 1 },
    ];
    const kept = enforceBudget(mixed, tokenizer);
    const labels = kept.map((b) => b.label);

    // Dropping the (smaller) spec block alone brings the total under budget,
    // so the (larger) blast_detail block must survive — proves order beats size.
    expect(labels).not.toContain('spec:a.md');
    expect(labels).toContain('blast_detail');
  });
});

// ---------- buildChangedFileSet / buildRiskRefSet (AC-6 / AC-7 allowlists) ----------

describe('buildChangedFileSet / buildRiskRefSet — the two real-reference allowlists (AC-6, AC-7)', () => {
  const smartDiff: SmartDiff = {
    groups: [
      {
        role: 'core',
        files: [{ path: 'src/a.ts', additions: 3, deletions: 1, finding_lines: [], pseudocode_summary: null }],
      },
    ],
    split_suggestion: { too_big: false, total_lines: 4, proposed_splits: [] },
  };
  const prFilePaths = ['src/a.ts', 'src/pr-only.ts'];

  const blast: BlastRadius = {
    changed_symbols: [{ name: 'foo', file: 'src/symbol.ts', kind: 'function' }],
    downstream: [
      {
        symbol: 'foo',
        callers: [{ name: 'bar', file: 'src/caller.ts', line: 10 }],
        endpoints_affected: ['GET /v1/foo'],
        crons_affected: [],
      },
    ],
    summary: '1 changed symbol(s)',
  };

  it('changedFileSet is exactly smart-diff paths + PR-file paths', () => {
    const set = buildChangedFileSet(smartDiff, prFilePaths);
    expect(set).toEqual(new Set(['src/a.ts', 'src/pr-only.ts']));
  });

  it('riskRefSet is broader: adds blast changed-symbol files, caller files, and affected endpoints on top of changedFileSet', () => {
    const changedFileSet = buildChangedFileSet(smartDiff, prFilePaths);
    const riskRefSet = buildRiskRefSet(changedFileSet, blast);

    expect(riskRefSet).toEqual(
      new Set(['src/a.ts', 'src/pr-only.ts', 'src/symbol.ts', 'src/caller.ts', 'GET /v1/foo']),
    );
    // A blast caller-only file is NOT itself a changed file.
    expect(changedFileSet.has('src/caller.ts')).toBe(false);
  });

  it('an empty (degraded) blast collapses riskRefSet to exactly changedFileSet (AC-14 fallback, no special-casing)', () => {
    const changedFileSet = buildChangedFileSet(smartDiff, prFilePaths);
    const riskRefSet = buildRiskRefSet(changedFileSet, EMPTY_BLAST);
    expect(riskRefSet).toEqual(changedFileSet);
  });
});

// ---------- validateBrief (AC-5 / AC-6 / AC-7) ----------

describe('validateBrief — shape + two-allowlist filtering (AC-5, AC-6, AC-7)', () => {
  const changedFileSet = new Set(['src/a.ts']);
  const riskRefSet = new Set(['src/a.ts', 'src/caller.ts', 'GET /v1/foo']);

  function modelOut(overrides: Partial<BriefModelOutput> = {}): BriefModelOutput {
    return {
      what: 'Adds rate limiting',
      why: 'Prevent abuse',
      risk_level: 'medium',
      risks: [
        {
          kind: 'perf',
          title: 'Hot path',
          explanation: 'may slow requests',
          severity: 'medium',
          file_refs: ['src/a.ts', 'src/caller.ts', 'GET /v1/foo', 'src/invented.ts'],
        },
      ],
      review_focus: [
        { path: 'src/a.ts', reason: 'core change' },
        { path: 'src/caller.ts', reason: 'a blast caller, but not itself changed' },
      ],
      ...overrides,
    };
  }

  it('produces a Brief with the required shape (AC-5): what/why/risk_level/risks/review_focus', () => {
    const validated = validateBrief(modelOut(), changedFileSet, riskRefSet);
    expect(validated).toMatchObject({
      what: 'Adds rate limiting',
      why: 'Prevent abuse',
      risk_level: 'medium',
    });
    expect(Array.isArray(validated.risks)).toBe(true);
    expect(Array.isArray(validated.review_focus)).toBe(true);
  });

  it('drops risks[].file_refs entries not in the broader riskRefSet (AC-6) but keeps valid file AND endpoint refs', () => {
    const validated = validateBrief(modelOut(), changedFileSet, riskRefSet);
    expect(validated.risks[0]!.file_refs).toEqual(['src/a.ts', 'src/caller.ts', 'GET /v1/foo']);
    expect(validated.risks[0]!.file_refs).not.toContain('src/invented.ts');
  });

  it('drops review_focus[].path entries not in the STRICT changedFileSet — a blast-caller-but-not-changed path is dropped, even though it is valid for risks[].file_refs (AC-7 vs AC-6 asymmetry)', () => {
    const validated = validateBrief(modelOut(), changedFileSet, riskRefSet);
    expect(validated.review_focus).toEqual([{ path: 'src/a.ts', reason: 'core change' }]);
    expect(validated.review_focus.some((r) => r.path === 'src/caller.ts')).toBe(false);
    // The very same path stayed valid for the broader risk-ref allowlist.
    expect(riskRefSet.has('src/caller.ts')).toBe(true);
  });

  it('drops a review_focus entry that is an invented endpoint-shaped path (never a valid review_focus.path even though endpoints are valid risk refs)', () => {
    const validated = validateBrief(
      modelOut({ review_focus: [{ path: 'GET /v1/foo', reason: 'looks like an endpoint' }] }),
      changedFileSet,
      riskRefSet,
    );
    expect(validated.review_focus).toEqual([]);
  });

  it('preserves model order among the surviving review_focus entries', () => {
    const validated = validateBrief(
      modelOut({
        review_focus: [
          { path: 'src/caller.ts', reason: 'dropped' },
          { path: 'src/a.ts', reason: 'second in model order but only survivor' },
        ],
      }),
      changedFileSet,
      riskRefSet,
    );
    expect(validated.review_focus).toEqual([
      { path: 'src/a.ts', reason: 'second in model order but only survivor' },
    ]);
  });
});

// ---------- gatherArtifacts (AC-13, AC-15, NG2 guard) ----------

describe('gatherArtifacts — omit-when-empty degradation (AC-13, AC-15)', () => {
  it('AC-13: no cached intent -> the intent_digest block is simply absent, no error thrown', async () => {
    const container = makeContainer({ intentRow: null });
    const artifacts = await gatherArtifacts(container, WS, PR_ID);

    expect(artifacts.blocks.some((b) => b.label === 'intent_digest')).toBe(false);
    // The rest of the assembly still produced a valid input.
    expect(artifacts.blocks.some((b) => b.label === 'blast_summary')).toBe(true);
  });

  it('a cached intent produces the intent_digest block with the digest content, never dropped by tier', async () => {
    const intentRow: PrIntentRow = {
      prId: PR_ID,
      intent: 'Add per-IP rate limiting to public endpoints',
      inScope: ['src/middleware/ratelimit.ts'],
      outOfScope: [],
      risks: [],
      headSha: 'sha-head',
    } as unknown as PrIntentRow;

    const container = makeContainer({ intentRow });
    const artifacts = await gatherArtifacts(container, WS, PR_ID);

    const block = artifacts.blocks.find((b) => b.label === 'intent_digest');
    expect(block).toBeDefined();
    expect(block!.dropTier).toBeUndefined();
    expect(block!.body).toContain('Add per-IP rate limiting to public endpoints');
  });

  it('AC-15: no linked issue and no attached specs -> those sections are simply omitted, input stays valid', async () => {
    const pull = makePull({ body: 'No issue reference here.' });
    const repo = makeRepo({ clonePath: null }); // no clone -> specs skipped entirely
    const container = makeContainer({ pull, repo, agents: [{ id: 'agent1' }] });

    const artifacts = await gatherArtifacts(container, WS, PR_ID);

    expect(artifacts.blocks.some((b) => b.label === 'linked_issue')).toBe(false);
    expect(artifacts.blocks.some((b) => b.label.startsWith('spec:'))).toBe(false);
    expect(artifacts.blocks.length).toBeGreaterThan(0); // still a valid, non-empty input
  });

  it('AC-15: an inaccessible linked issue (fetch fails) degrades to omitted, not an error', async () => {
    const pull = makePull({ body: 'Fixes #123' });
    const container = makeContainer({
      pull,
      getIssue: async () => {
        throw new Error('404 from GitHub');
      },
    });

    const artifacts = await gatherArtifacts(container, WS, PR_ID);
    expect(artifacts.blocks.some((b) => b.label === 'linked_issue')).toBe(false);
  });

  it('a resolvable linked issue produces a linked_issue block that is droppable (has a dropTier)', async () => {
    const pull = makePull({ body: 'Fixes #123' });
    const container = makeContainer({ pull });

    const artifacts = await gatherArtifacts(container, WS, PR_ID);
    const block = artifacts.blocks.find((b) => b.label === 'linked_issue');
    expect(block).toBeDefined();
    expect(block!.dropTier).toBeDefined();
  });
});

describe('gatherArtifacts — NG2 guard: no patch/diff content ever reaches the prompt blocks', () => {
  it('smart-diff-derived content in the assembled blocks is stats-only — a patch/pseudocode-shaped body on a PR file never leaks into the smart_diff_detail block', async () => {
    const container = makeContainer({
      prFiles: [
        {
          path: 'src/a.ts',
          additions: 3,
          deletions: 1,
          patch:
            '@@ -1,3 +1,4 @@\n+function pseudocodeSummary() { return "leak this snippet"; }\ndiff --git a/src/a.ts b/src/a.ts',
        },
      ],
    });

    const artifacts = await gatherArtifacts(container, WS, PR_ID);
    const smartDiffBlock = artifacts.blocks.find((b) => b.label === 'smart_diff_detail');

    expect(smartDiffBlock).toBeDefined();
    // Only the path + numeric stats are present, never the patch/snippet text.
    expect(smartDiffBlock!.body).toContain('src/a.ts');
    expect(smartDiffBlock!.body).not.toContain('leak this snippet');
    expect(smartDiffBlock!.body).not.toContain('diff --git');
    expect(smartDiffBlock!.body).not.toContain('@@');
    // No block anywhere in the assembled input carries patch markers.
    for (const b of artifacts.blocks) {
      expect(b.body).not.toContain('diff --git');
      expect(b.body).not.toContain('@@ -');
    }
  });
});
