import { describe, expect, it } from 'vitest';
import { buildVerdict, compactConvention, compactFinding } from '../format.js';
import type { Convention } from '@devdigest/shared';
import { makeFinding, makeReview } from './helpers.js';

describe('buildVerdict', () => {
  it('returns pass with zeroed counts when there are no findings', () => {
    const { verdict, findings } = buildVerdict([makeReview({ findings: [] })]);
    expect(verdict.status).toBe('pass');
    expect(verdict.counts).toEqual({ critical: 0, warning: 0, suggestion: 0 });
    expect(findings).toEqual([]);
  });

  it('blocks and counts by severity when a CRITICAL exists', () => {
    const { verdict } = buildVerdict([
      makeReview({
        findings: [
          makeFinding({ id: 'a', severity: 'CRITICAL' }),
          makeFinding({ id: 'b', severity: 'WARNING' }),
          makeFinding({ id: 'c', severity: 'SUGGESTION' }),
        ],
      }),
    ]);
    expect(verdict.status).toBe('blocked');
    expect(verdict.counts).toEqual({ critical: 1, warning: 1, suggestion: 1 });
  });

  it('ignores summary-kind rows so findings are not double-counted', () => {
    const { verdict, findings } = buildVerdict([
      makeReview({ kind: 'summary', findings: [makeFinding({ severity: 'CRITICAL' })] }),
    ]);
    expect(verdict.counts.critical).toBe(0);
    expect(findings).toEqual([]);
    expect(verdict.status).toBe('pass');
  });

  it('uses the lowest non-null score across reviews', () => {
    const { verdict } = buildVerdict([
      makeReview({ id: 'r1', score: 90 }),
      makeReview({ id: 'r2', score: 40 }),
      makeReview({ id: 'r3', score: null }),
    ]);
    expect(verdict.score).toBe(40);
  });

  it('returns null score when every review score is null', () => {
    const { verdict } = buildVerdict([makeReview({ score: null })]);
    expect(verdict.score).toBeNull();
  });
});

describe('compactFinding', () => {
  it('keeps only needed fields and normalizes suggestion to null', () => {
    const f = compactFinding(makeFinding({ suggestion: undefined }));
    expect(f).toEqual({
      severity: 'WARNING',
      category: 'bug',
      title: 'Off-by-one',
      file: 'src/a.ts',
      start_line: 10,
      end_line: 12,
      rationale: 'because',
      suggestion: null,
      confidence: 0.8,
    });
  });
});

describe('compactConvention', () => {
  it('maps nullish fields to null', () => {
    const c: Convention = {
      id: 'c1',
      repo_id: 'repo-1',
      category: undefined,
      rule: 'use tabs',
      evidence: undefined,
      confidence: undefined,
      status: 'accepted',
      created_at: 'x',
      updated_at: 'y',
    };
    expect(compactConvention(c)).toEqual({
      rule: 'use tabs',
      category: null,
      evidence: null,
      confidence: null,
      status: 'accepted',
    });
  });
});
