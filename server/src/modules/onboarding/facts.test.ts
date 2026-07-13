import { describe, it, expect, vi } from 'vitest';
import type { Container } from '../../platform/container.js';
import type { ReachableFacts } from '../repo-intel/types.js';
import { gatherFacts } from './facts.js';

/**
 * Hermetic unit tests for `gatherFacts`. The function reads only through
 * `container.repoRepo` and `container.repoIntel` (both faked here) plus a
 * guarded clone-manifest read via fs (skipped by leaving `clonePath` null) —
 * no real Postgres, no fs, no model.
 *
 * Covers AC-2 (reading path ordered by rank, as returned by
 * `getTopFilesByRank` — never re-sorted alphabetically/by-date),
 * AC-3 (no hotness dependency — pure pass-through of the facade's rank order,
 * regardless of repo size / file count) and AC-13 (fixed budgets — the
 * facade is always asked for the same top-N count, never a
 * generator-computed threshold).
 */

const WS = 'ws1';
const REPO = 'repo1';

function makeContainer(opts: {
  topFiles?: string[];
  getTopFilesByRank?: ReturnType<typeof vi.fn>;
  criticalPaths?: string[][];
  reachableFacts?: Record<string, ReachableFacts>;
}): Container {
  const getTopFilesByRank =
    opts.getTopFilesByRank ?? vi.fn(async () => opts.topFiles ?? []);
  return {
    repoRepo: {
      getById: async () => ({ id: REPO, clonePath: null }),
    },
    repoIntel: {
      getIndexState: async () => ({
        status: 'full',
        filesIndexed: 42,
        filesSkipped: 0,
        durationMs: 10,
        repoId: REPO,
        lastIndexedSha: 'sha1',
        indexerVersion: 1,
        updatedAt: new Date(),
      }),
      getTopFilesByRank,
      getCriticalPaths: async () => opts.criticalPaths ?? [],
      getRepoMap: async () => ({ text: 'map', tokens: 10, cached: false }),
      getReachableFacts: async () => opts.reachableFacts ?? {},
    },
  } as unknown as Container;
}

describe('gatherFacts — reading path order (AC-2, AC-3)', () => {
  it('preserves the exact order returned by getTopFilesByRank (rank order), not alphabetical or date order', async () => {
    // Deliberately NOT alphabetical — proves gatherFacts does not re-sort.
    const rankOrder = ['zeta.ts', 'alpha.ts', 'mid.ts'];
    const facts = await gatherFacts(makeContainer({ topFiles: rankOrder }), WS, REPO);

    expect(facts.topFiles).toEqual(rankOrder);
  });

  it('does not depend on any non-zero hotness signal — the rank order is whatever the facade (pure pagerank when hotness=0) returns, untouched', async () => {
    const rankOrder = ['b.ts', 'a.ts', 'c.ts'];
    const facts = await gatherFacts(makeContainer({ topFiles: rankOrder }), WS, REPO);

    // No hotness-related field exists on TourFacts and the order is a
    // straight pass-through — asserting equality (not merely "same set")
    // proves gatherFacts applies no secondary re-ranking of its own.
    expect(facts.topFiles).toEqual(rankOrder);
  });
});

describe('gatherFacts — fixed budgets (AC-13)', () => {
  it('requests the same fixed top-N count from the facade regardless of how many files the repo has', async () => {
    const getTopFilesByRank = vi.fn(async (_repoId: string, _n: number) =>
      Array.from({ length: 500 }, (_, i) => `f${i}.ts`),
    );
    await gatherFacts(makeContainer({ getTopFilesByRank }), WS, REPO);

    const firstCall = getTopFilesByRank.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [, count] = firstCall!;
    expect(count).toBe(15);

    // A tiny repo asks for the SAME fixed count — no generator-side threshold
    // branches on repo size.
    const smallRepoFn = vi.fn(async (_repoId: string, _n: number) => ['only.ts']);
    await gatherFacts(makeContainer({ getTopFilesByRank: smallRepoFn }), WS, REPO);
    const smallCall = smallRepoFn.mock.calls[0];
    expect(smallCall).toBeDefined();
    const [, smallCount] = smallCall!;
    expect(smallCount).toBe(count);
  });
});
