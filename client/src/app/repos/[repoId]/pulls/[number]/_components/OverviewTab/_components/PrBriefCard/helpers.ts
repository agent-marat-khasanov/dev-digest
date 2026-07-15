import type { RiskSeverity } from "@devdigest/shared";

export function riskLevelColors(level: RiskSeverity): { color: string; bg: string } {
  switch (level) {
    case "high":
      return { color: "var(--crit)", bg: "var(--crit-bg)" };
    case "medium":
      return { color: "var(--warn)", bg: "var(--warn-bg)" };
    case "low":
      return { color: "var(--ok)", bg: "var(--ok-bg)" };
  }
}

const ENDPOINT_REF = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\//;

/** Blast-derived endpoint refs look like "GET /v1/foo" — everything else is a file path. */
export function isEndpointRef(ref: string): boolean {
  return ENDPOINT_REF.test(ref);
}
