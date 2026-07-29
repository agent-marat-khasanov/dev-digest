/** Format a USD cost estimate for the confirm dialog. */
export function formatEstimateCost(usd: number): string {
  return `$${usd.toFixed(4)}`;
}
