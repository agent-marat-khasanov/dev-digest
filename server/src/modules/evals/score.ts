import type { ExpectedFinding, Finding } from '@devdigest/shared';

/**
 * Pure eval scorer — compares a case's expected findings against the findings
 * an actual review produced. No I/O; unit-tested in isolation.
 *
 * Matching rule: an expected finding is "found" when SOME not-yet-consumed
 * actual finding has the same `file`, the same `category`, and a line span that
 * overlaps the expected one (greedy one-to-one). This tolerates the model
 * reporting a slightly different line within the same hunk.
 */

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

/**
 * @param changedLines set of `${file}:${line}` keys present in the case diff
 *   (new side). Used for citation accuracy. Empty set ⇒ accuracy treated as 1
 *   (no diff to check against).
 */
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

  // A clean case (no expected findings) passes iff the review produced none.
  // Otherwise pass iff every expected finding was matched (recall === 1). We do
  // not fail on extra findings here — that's reflected in `precision`.
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
