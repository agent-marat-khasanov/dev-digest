/** Format a USD cost estimate for the confirm dialog. */
export function formatCost(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

/** `ran_at` timestamp → "YYYY-MM-DD HH:mm" (mono, matches the mockups). */
export function formatRanAt(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
