/** Co-located helpers for TourView — mirrors ContextView's helpers.ts. */

/** Honest, human-readable label for a skeleton/not_available `reason` code (AC-10/AC-12). */
const REASON_LABEL: Record<string, string> = {
  index_degraded: "the repo index isn't fully built yet",
  repo_too_large: "this repo is too large to index fully",
  not_cloned: "this repo hasn't been synced locally",
  model_failed: "the AI model call failed",
};

export function reasonLabel(reason: string | null | undefined): string {
  if (!reason) return "an unknown reason";
  return REASON_LABEL[reason] ?? reason;
}

export function formatGeneratedAt(iso: string | null | undefined): string {
  if (!iso) return "never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "never";
  return date.toLocaleString();
}
