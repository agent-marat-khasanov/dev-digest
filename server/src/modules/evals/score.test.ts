import { describe, it, expect } from 'vitest';
import type { ExpectedFinding, Finding } from '@devdigest/shared';
import { scoreEval } from './score.js';

/**
 * Deterministic, model-free unit tests for the pure `scoreEval` scorer
 * (`verify:l06`). No LLM, no network, no DB — only plain fixtures over
 * `scoreEval`'s exact signature: `(expected, actual, changedLines)`.
 *
 * Proves AC-3 (must-find / must-not-flag are expressed only via
 * `expected_output` cardinality — never a type flag), AC-15 (recall),
 * AC-16 (precision), AC-17 (citation_accuracy), and AC-19 (both
 * expectation types score correctly).
 */

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    severity: 'WARNING',
    category: 'bug',
    title: 'issue',
    file: 'src/foo.ts',
    start_line: 10,
    end_line: 10,
    rationale: 'because',
    suggestion: null,
    confidence: 0.9,
    kind: 'finding',
    trifecta_components: null,
    evidence: null,
    ...overrides,
  };
}

function expectedFinding(overrides: Partial<ExpectedFinding> = {}): ExpectedFinding {
  return {
    severity: 'WARNING',
    category: 'bug',
    title: 'issue',
    file: 'src/foo.ts',
    start_line: 10,
    end_line: 10,
    ...overrides,
  };
}

describe('scoreEval', () => {
  it('AC-15/AC-19: a must-find case reflects recall from the matched finding', () => {
    const expected: ExpectedFinding[] = [expectedFinding()];
    const actual: Finding[] = [finding()];
    const score = scoreEval(expected, actual, new Set(['src/foo.ts:10']));

    expect(score.recall).toBe(1);
    expect(score.matched).toBe(1);
    expect(score.pass).toBe(true);
  });

  it('AC-15: recall is matched-expected / total-expected when only some expected findings are matched', () => {
    const expected: ExpectedFinding[] = [
      expectedFinding({ file: 'src/foo.ts', start_line: 10, end_line: 10 }),
      expectedFinding({ file: 'src/bar.ts', start_line: 20, end_line: 20 }),
    ];
    // Only the first expected finding is reproduced by the run.
    const actual: Finding[] = [finding({ file: 'src/foo.ts', start_line: 10, end_line: 10 })];
    const score = scoreEval(expected, actual, new Set());

    expect(score.matched).toBe(1);
    expect(score.recall).toBe(0.5);
    expect(score.pass).toBe(false);
  });

  it('AC-15: recall is 1 when nothing is expected (must-not-flag case, clean run)', () => {
    const score = scoreEval([], [], new Set());
    expect(score.recall).toBe(1);
    expect(score.pass).toBe(true);
  });

  it('AC-16/AC-19: a must-not-flag case scores precision 1 when the run produces no findings', () => {
    const score = scoreEval([], [], new Set(['src/foo.ts:10']));
    expect(score.precision).toBe(1);
    expect(score.pass).toBe(true);
  });

  it('AC-16/AC-19: a must-not-flag case scores precision 0 when the run re-flags noise', () => {
    const actual: Finding[] = [finding()];
    const score = scoreEval([], actual, new Set(['src/foo.ts:10']));

    expect(score.precision).toBe(0);
    expect(score.pass).toBe(false);
  });

  it('AC-16: precision is matched-expected / total-actual for a must-find case with extra findings', () => {
    const expected: ExpectedFinding[] = [expectedFinding()];
    const actual: Finding[] = [
      finding(),
      finding({ id: 'f2', file: 'src/other.ts', start_line: 5, end_line: 5 }),
    ];
    const score = scoreEval(expected, actual, new Set(['src/foo.ts:10', 'src/other.ts:5']));

    expect(score.matched).toBe(1);
    expect(score.precision).toBe(0.5);
  });

  it('AC-17: citation_accuracy is grounded-survivors / total-actual', () => {
    const expected: ExpectedFinding[] = [];
    const actual: Finding[] = [
      finding({ id: 'f1', file: 'src/foo.ts', start_line: 10, end_line: 10 }),
      finding({ id: 'f2', file: 'src/foo.ts', start_line: 999, end_line: 999 }),
    ];
    // Only line 10 is part of the case's diff (changed lines).
    const score = scoreEval(expected, actual, new Set(['src/foo.ts:10']));

    expect(score.citationAccuracy).toBe(0.5);
  });

  it('AC-17: citation_accuracy is 1 when there are no findings, or when changedLines is empty (no diff to check)', () => {
    expect(scoreEval([], [], new Set(['src/foo.ts:10'])).citationAccuracy).toBe(1);
    expect(scoreEval([], [finding()], new Set()).citationAccuracy).toBe(1);
  });

  it('AC-3: must-find vs must-not-flag is expressed only through expected_output cardinality', () => {
    // Same actual findings, only `expected` differs — no separate "type" input exists on scoreEval.
    const actual: Finding[] = [finding()];
    const mustFind = scoreEval([expectedFinding()], actual, new Set());
    const mustNotFlag = scoreEval([], actual, new Set());

    expect(mustFind.pass).toBe(true);
    expect(mustNotFlag.pass).toBe(false);
  });

  // Mutation-killing (L06 Stretch 5): the overlap tolerance in `overlaps` — an
  // expected finding matches an actual one whose line span OVERLAPS but is not
  // identical ("the model reported a slightly different line in the same hunk").
  // The original suite only used exact same-line spans, so a mutation of the
  // overlap operator (`a.start_line <= b.end_line` → `>=`) SURVIVED. These kill it.
  it('overlap tolerance: expected 10-12 matches actual 11-13 (offset overlap) → recall 1', () => {
    const score = scoreEval(
      [expectedFinding({ start_line: 10, end_line: 12 })],
      [finding({ start_line: 11, end_line: 13 })],
      new Set(),
    );
    expect(score.matched).toBe(1);
    expect(score.recall).toBe(1);
  });

  it('overlap tolerance: expected 11-13 matches actual 10-12 (reverse offset overlap) → recall 1', () => {
    const score = scoreEval(
      [expectedFinding({ start_line: 11, end_line: 13 })],
      [finding({ start_line: 10, end_line: 12 })],
      new Set(),
    );
    expect(score.matched).toBe(1);
    expect(score.recall).toBe(1);
  });

  it('overlap tolerance: disjoint spans (10-10 vs 12-12) do NOT match → recall 0', () => {
    const score = scoreEval(
      [expectedFinding({ start_line: 10, end_line: 10 })],
      [finding({ start_line: 12, end_line: 12 })],
      new Set(),
    );
    expect(score.matched).toBe(0);
    expect(score.recall).toBe(0);
  });

  it('sanity check: a deliberately wrong expectation fails the assertion (proves the gate is live)', () => {
    const score = scoreEval([expectedFinding()], [], new Set());
    expect(() => expect(score.recall).toBe(1)).toThrow();
  });
});
