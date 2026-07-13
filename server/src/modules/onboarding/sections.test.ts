import { describe, it, expect } from 'vitest';
import { TOUR_SECTIONS, buildSkeleton, validatePaths } from './sections.js';
import type { TourFacts } from './facts.js';

/**
 * Hermetic unit tests for the pure onboarding section helpers — no DB, no
 * model, no fs. Covers AC-6 (exactly five mandatory sections, fixed order,
 * stable ids, no routes_and_apis) and AC-7 (validatePaths drops unknown
 * paths from the allowlist).
 */

function makeFacts(overrides: Partial<TourFacts> = {}): TourFacts {
  return {
    repoId: 'repo1',
    topFiles: [],
    criticalPaths: [],
    reachableFacts: {},
    repoMap: '',
    commands: [],
    allowedPaths: new Set(),
    filesIndexed: 0,
    indexedSha: null,
    indexStatus: 'full',
    degraded: false,
    ...overrides,
  };
}

describe('TOUR_SECTIONS (AC-6)', () => {
  it('is exactly the five mandatory sections, in fixed order, with stable ids, and no routes_and_apis', () => {
    expect(TOUR_SECTIONS.map((s) => s.id)).toEqual([
      'architecture',
      'critical_paths',
      'run_locally',
      'reading_path',
      'first_tasks',
    ]);
    expect(TOUR_SECTIONS).toHaveLength(5);
    expect(TOUR_SECTIONS.some((s) => (s.id as string) === 'routes_and_apis')).toBe(false);
  });
});

describe('buildSkeleton (AC-6)', () => {
  it('returns exactly the five sections in fixed order every time, regardless of facts content', () => {
    const skeleton = buildSkeleton(makeFacts(), 'index_degraded');
    expect(skeleton.map((s) => s.id)).toEqual([
      'architecture',
      'critical_paths',
      'run_locally',
      'reading_path',
      'first_tasks',
    ]);
    expect(skeleton).toHaveLength(5);
    expect(skeleton.some((s) => (s.id as string) === 'routes_and_apis')).toBe(false);
  });

  it('produces the same five stable ids for a richly populated fact set too', () => {
    const facts = makeFacts({
      topFiles: ['src/a.ts', 'src/b.ts'],
      criticalPaths: [['src/a.ts', 'src/b.ts']],
      commands: ['pnpm install'],
    });
    const skeleton = buildSkeleton(facts, 'index_degraded');
    expect(skeleton.map((s) => s.id)).toEqual([
      'architecture',
      'critical_paths',
      'run_locally',
      'reading_path',
      'first_tasks',
    ]);
  });
});

describe('validatePaths (AC-7)', () => {
  it('drops items whose path is not present in the allowlist, keeping the allowed ones', () => {
    const allowed = new Set(['src/real.ts', 'src/also-real.ts']);
    const items = [
      { path: 'src/real.ts', role: 'entry point' },
      { path: 'src/hallucinated.ts', role: 'made up by the model' },
      { path: 'src/also-real.ts', role: 'core logic' },
    ];

    const result = validatePaths(items, allowed);

    expect(result.map((i) => i.path)).toEqual(['src/real.ts', 'src/also-real.ts']);
  });

  it('returns an empty array when every path is unknown', () => {
    const allowed = new Set(['src/real.ts']);
    const items = [{ path: 'src/unknown-a.ts' }, { path: 'src/unknown-b.ts' }];

    expect(validatePaths(items, allowed)).toEqual([]);
  });
});
