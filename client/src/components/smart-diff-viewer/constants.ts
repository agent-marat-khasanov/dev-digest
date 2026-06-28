import type { SmartDiffRole } from "@devdigest/shared";

export const ROLE_LABEL: Record<SmartDiffRole, string> = {
  core: "Core",
  wiring: "Wiring",
  boilerplate: "Boilerplate",
};

export const ROLE_CAPTION: Record<SmartDiffRole, string> = {
  core: "Business logic",
  wiring: "Config & entry points",
  boilerplate: "Generated & lock files",
};

/** Severity → CSS colour token (mirrors FindingCard/constants.ts). */
export const SEV_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
};

export const SEV_COLOR_FALLBACK = "var(--text-muted)";
