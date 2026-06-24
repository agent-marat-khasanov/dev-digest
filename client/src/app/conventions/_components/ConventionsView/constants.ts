import type { SkillType } from "@devdigest/shared";

/** Conventions are always baked into a skill of this type. */
export const SKILL_TYPE: SkillType = "convention";

export const CREATE_MODAL_WIDTH = 640;

/** Confidence-bar colour thresholds (percent). */
export const CONFIDENCE_COLORS = {
  high: "var(--ok)", // >= 80
  mid: "var(--warn)", // 50–79
  low: "var(--crit)", // < 50
} as const;
