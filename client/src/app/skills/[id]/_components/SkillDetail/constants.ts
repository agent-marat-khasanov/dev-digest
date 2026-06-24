import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under `skills.lab.tabs`. */
export interface SkillTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** Tabs the Skill detail right pane renders. Order matches the design mocks. */
export const TABS: readonly SkillTab[] = [
  { key: "config", labelKey: "tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "tabs.preview", icon: "Eye" },
  { key: "evals", labelKey: "tabs.evals", icon: "FlaskConical" },
  { key: "stats", labelKey: "tabs.stats", icon: "BarChart" },
  { key: "versions", labelKey: "tabs.versions", icon: "History" },
];

/** Tab keys accepted by the `?tab=` query param. */
export const VALID_TAB_KEYS = TABS.map((t) => t.key);
