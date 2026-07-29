// REAL file, verbatim: server/src/modules/evals/score.ts (current HEAD). Pure domain logic, zero
// I/O, zero framework/ORM dependency — correctly layered per onion-architecture (a pure function
// has nothing to violate the dependency rule with). It DOES have a real nested O(n*m) loop
// (`scoreEval`'s double for-loop) and short variable names (`e`, `a`, `i`) — genuine style/perf
// characteristics of the real code, used here to check the reviewer stays confined to
// architecture/layering and does not comment on naming or algorithmic complexity.

import type { ExpectedFinding, Finding } from '@devdigest/shared';

export interface EvalScore {
  recall: number;
  precision: number;
  citationAccuracy: number;
  pass: boolean;
  matched: number;
}

type Span = { start_line: number; end_line: number };
const overlaps = (a: Span, b: Span): boolean =>
  a.start_line <= b.end_line && b.start_line <= a.end_line;

export function scoreEval(
  expected: ExpectedFinding[],
  actual: Finding[],
  changedLines: Set<string>,
): EvalScore {
  const consumed = new Set<number>();
  let matched = 0;
  for (const e of expected) {
    for (let i = 0; i < actual.length; i++) {
      if (consumed.has(i)) continue;
      const a = actual[i]!;
      if (a.file === e.file && a.category === e.category && overlaps(e, a)) {
        consumed.add(i);
        matched++;
        break;
      }
    }
  }

  const recall = expected.length > 0 ? matched / expected.length : 1;
  const precision =
    actual.length > 0 ? matched / actual.length : expected.length === 0 ? 1 : 0;
  const citationAccuracy =
    actual.length > 0
      ? actual.filter((f) => isCited(f, changedLines)).length / actual.length
      : 1;

  const pass = expected.length > 0 ? matched === expected.length : actual.length === 0;

  return { recall, precision, citationAccuracy, pass, matched };
}

function isCited(f: Finding, changedLines: Set<string>): boolean {
  if (changedLines.size === 0) return true;
  const end = Math.min(f.end_line, f.start_line + 1000);
  for (let ln = f.start_line; ln <= end; ln++) {
    if (changedLines.has(`${f.file}:${ln}`)) return true;
  }
  return false;
}
