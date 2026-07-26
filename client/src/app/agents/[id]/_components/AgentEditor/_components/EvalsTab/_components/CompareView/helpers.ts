/** Pure helpers for CompareView. */

export interface DiffLine {
  kind: "add" | "del" | "ctx";
  text: string;
}

/**
 * Naive line-based diff (LCS) between two strings — used to show the
 * system-prompt delta between two agent versions. Prompts are short, so a
 * plain O(n*m) LCS is simplest; no need for the `diff` package for this.
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

export function formatMetricDelta(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(2)}`;
}

export function formatCostDeltaSign(value: number): "+" | "-" | "" {
  return value > 0 ? "+" : value < 0 ? "-" : "";
}
