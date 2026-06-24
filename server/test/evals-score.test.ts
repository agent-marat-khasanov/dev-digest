import { describe, it, expect } from 'vitest';
import type { ExpectedFinding, Finding } from '../src/vendor/shared/index.js';
import { scoreEval } from '../src/modules/evals/score.js';

/**
 * Unit coverage for the eval scorer. Matching is by file + category + overlapping
 * line span; pass requires every expected finding matched (clean cases require
 * an empty actual set). These mirror the seeded gold cases.
 */

const expected = (over: Partial<ExpectedFinding> = {}): ExpectedFinding => ({
  severity: 'CRITICAL',
  category: 'security',
  title: 'x',
  file: 'src/config.ts',
  start_line: 10,
  end_line: 10,
  ...over,
});

const actual = (over: Partial<Finding> = {}): Finding => ({
  id: 'f1',
  severity: 'CRITICAL',
  category: 'security',
  title: 'x',
  file: 'src/config.ts',
  start_line: 10,
  end_line: 10,
  rationale: 'r',
  confidence: 0.9,
  ...over,
});

const noLines = new Set<string>();

describe('scoreEval', () => {
  it('matches on file + category + overlapping span (expected 1, got 1 → pass)', () => {
    const r = scoreEval([expected()], [actual({ start_line: 9, end_line: 11 })], noLines);
    expect(r.matched).toBe(1);
    expect(r.recall).toBe(1);
    expect(r.precision).toBe(1);
    expect(r.pass).toBe(true);
  });

  it('fails when an expected finding is missed (expected 1, got 0)', () => {
    const r = scoreEval([expected()], [], noLines);
    expect(r.matched).toBe(0);
    expect(r.recall).toBe(0);
    expect(r.precision).toBe(0);
    expect(r.pass).toBe(false);
  });

  it('passes a clean case only when the review produced nothing (expected 0, got 0)', () => {
    expect(scoreEval([], [], noLines).pass).toBe(true);
    expect(scoreEval([], [actual()], noLines).pass).toBe(false);
  });

  it('does not match across a different file or category', () => {
    expect(scoreEval([expected()], [actual({ file: 'src/other.ts' })], noLines).matched).toBe(0);
    expect(scoreEval([expected()], [actual({ category: 'bug' })], noLines).matched).toBe(0);
  });

  it('reports precision below 1 when there are extra (false-positive) findings', () => {
    const r = scoreEval([expected()], [actual(), actual({ id: 'f2', start_line: 50, end_line: 50 })], noLines);
    expect(r.matched).toBe(1);
    expect(r.recall).toBe(1);
    expect(r.precision).toBe(0.5);
    // extra findings hurt precision but do not fail a fully-recalled case
    expect(r.pass).toBe(true);
  });

  it('scores citation accuracy against the diff changed lines', () => {
    const cited = scoreEval([expected()], [actual()], new Set(['src/config.ts:10']));
    expect(cited.citationAccuracy).toBe(1);
    const uncited = scoreEval([expected()], [actual({ start_line: 999, end_line: 999 })], new Set(['src/config.ts:10']));
    expect(uncited.citationAccuracy).toBe(0);
  });
});
