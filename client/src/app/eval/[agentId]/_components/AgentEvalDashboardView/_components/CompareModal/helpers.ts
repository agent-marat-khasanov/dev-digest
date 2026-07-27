/** Pure helpers for CompareModal (Screen 3). */

export interface DiffLine {
  kind: "add" | "del" | "ctx";
  text: string;
}

/**
 * Naive line-based diff (LCS) between two strings — used to show the
 * system-prompt delta between the two compared agent versions. Prompts are
 * short, so a plain O(n*m) LCS is simplest; no need for the `diff` package.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "ctx", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ kind: "del", text: a[i]! });
      i++;
    } else {
      out.push({ kind: "add", text: b[j]! });
      j++;
    }
  }
  while (i < n) {
    out.push({ kind: "del", text: a[i]! });
    i++;
  }
  while (j < m) {
    out.push({ kind: "add", text: b[j]! });
    j++;
  }
  return out;
}

/** "78% → 82%" transition string, older on the left, newer on the right. */
export function formatPctTransition(older: number, newer: number): { older: string; newer: string } {
  return { older: `${Math.round(older * 100)}%`, newer: `${Math.round(newer * 100)}%` };
}

/** Point delta between two 0..1 metrics, e.g. "▲4pt" / "▼2pt" / "±0pt". */
export function formatPointDelta(older: number, newer: number): { text: string; up: boolean; flat: boolean } {
  const pts = Math.round(newer * 100) - Math.round(older * 100);
  return { text: `${pts > 0 ? "▲" : pts < 0 ? "▼" : "±"}${Math.abs(pts)}pt`, up: pts > 0, flat: pts === 0 };
}

/** Cost delta between two runs, e.g. "▲$0.02" / "▼$0.02" / "±$0.00". */
export function formatCostDelta(older: number, newer: number): { text: string; up: boolean; flat: boolean } {
  const delta = newer - older;
  const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "±";
  return { text: `${arrow}$${Math.abs(delta).toFixed(2)}`, up: delta > 0, flat: delta === 0 };
}
