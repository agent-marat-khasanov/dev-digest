/** Shared cost formatter for the Run Cost Badge.
 *
 * Null → "—" (per spec: a run without data shows the dash, not "$0.00").
 * < $0.01 → 4 decimals (e.g. "$0.0013") so cheap runs read as non-zero.
 * Otherwise → 3 decimals (e.g. "$0.012") matching the PR-list density. */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}
