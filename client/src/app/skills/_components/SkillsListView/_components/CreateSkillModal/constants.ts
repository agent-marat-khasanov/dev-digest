import type { SkillType } from "@devdigest/shared";

/** Modal width (px) — matches CreateAgentModal. */
export const MODAL_WIDTH = 620;

/** All skill types — also the dropdown options. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Initial type selected in the create form. */
export const DEFAULT_TYPE: SkillType = "custom";
