import type { Severity } from "@devdigest/shared";

/** Severity → CSS-var color pair for the per-row badge + status accent. */
export const SEVERITY_COLOR: Record<Severity, { color: string; bg: string }> = {
  CRITICAL: { color: "var(--crit)", bg: "var(--crit-bg)" },
  WARNING: { color: "var(--warn)", bg: "var(--warn-bg)" },
  SUGGESTION: { color: "var(--sugg)", bg: "var(--sugg-bg)" },
};
