/* SkillCard — name + toggle + type + source chip + 30d stats row. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Toggle, type IconName } from "@devdigest/ui";
import type { Skill, SkillSource } from "@devdigest/shared";
import { useDeleteSkill } from "@/lib/hooks/skills";
import { TYPE_COLOR } from "./constants";
import { s } from "./styles";

const SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  extracted: "Link",
  community: "Globe",
  imported_url: "Upload",
};

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills.lab");
  const del = useDeleteSkill();
  const color = TYPE_COLOR[skill.type];
  const hasStats = skill.agents_count != null || skill.pull_frequency_pct != null || skill.accept_rate_pct != null;
  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={15} />
        </div>
        <span style={s.name}>{skill.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(t("editor.deleteConfirm", { name: skill.name }))) del.mutate(skill.id);
          }}
          disabled={del.isPending}
          title="Delete skill"
          aria-label="Delete skill"
          style={{
            background: "none",
            border: "none",
            cursor: del.isPending ? "not-allowed" : "pointer",
            color: "var(--text-muted)",
            display: "inline-flex",
            padding: 4,
          }}
        >
          <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>
      <div style={s.description}>{skill.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <span className="mono" style={s.typeChip(color)}>
          {skill.type}
        </span>
        <SourceChip source={skill.source} />
      </div>
      {hasStats && (
        <div style={s.statsRow}>
          {skill.agents_count != null && (
            <span style={s.statSegment}>
              <span style={s.statValueMuted}>
                {t("cardExtra.agents", { count: skill.agents_count })}
              </span>
            </span>
          )}
          {skill.pull_frequency_pct != null && (
            <span style={s.statSegment}>
              <span style={s.statValueMuted}>
                {skill.pull_frequency_pct}
                {t("cardExtra.pullSuffix")}
              </span>
            </span>
          )}
          {skill.accept_rate_pct != null && (
            <span style={s.statSegment}>
              <span style={s.statValueOk}>
                {skill.accept_rate_pct}
                {t("cardExtra.acceptSuffix")}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SourceChip({ source }: { source: SkillSource }) {
  const t = useTranslations("skills.lab.cardExtra.source");
  const IconCmp = Icon[SOURCE_ICON[source]];
  return (
    <span style={s.sourceChip}>
      <IconCmp size={11} />
      {t(source)}
    </span>
  );
}
