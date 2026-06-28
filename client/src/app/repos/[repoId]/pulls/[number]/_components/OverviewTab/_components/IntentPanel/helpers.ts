import type { RiskSeverity } from "@devdigest/shared";

export function severityChipColors(severity: RiskSeverity): { color: string; bg: string } {
  switch (severity) {
    case "high":
      return { color: "var(--crit)", bg: "var(--crit-bg)" };
    case "medium":
      return { color: "var(--warn)", bg: "var(--warn-bg)" };
    case "low":
      return { color: "var(--sugg)", bg: "var(--sugg-bg)" };
  }
}
