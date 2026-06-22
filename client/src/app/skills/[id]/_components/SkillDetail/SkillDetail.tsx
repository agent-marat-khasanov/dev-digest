"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { EvalsTab } from "./_components/EvalsTab";
import { TABS } from "./constants";
import { s } from "./styles";

/**
 * Skill detail right pane. Mirrors AgentEditor: a Tabs strip at the top
 * driven by `?tab=`, a content area below that swaps based on the active
 * tab. Each tab is its own colocated component so the heavy ones (CodeMirror,
 * the stats charts) stay isolated.
 */
export function SkillDetail({ skill, tab, onTab }: { skill: Skill; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("skills.lab");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "preview" ? (
          <PreviewTab skill={skill} />
        ) : tab === "evals" ? (
          <EvalsTab skill={skill} />
        ) : tab === "stats" ? (
          <StatsTab skill={skill} />
        ) : tab === "versions" ? (
          <VersionsTab skill={skill} />
        ) : (
          <ConfigTab skill={skill} />
        )}
      </div>
    </div>
  );
}
