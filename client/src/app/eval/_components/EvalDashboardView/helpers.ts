/** Format a fractional metric (0..1 or null) as a percentage string. */
export function formatMetric(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

/** Format a USD cost estimate for the confirm dialog. */
export function formatCost(usd: number): string {
  return `$${usd.toFixed(4)}`;
}
