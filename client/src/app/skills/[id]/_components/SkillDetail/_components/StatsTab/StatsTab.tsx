"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CircularScore, Donut, ErrorState, Icon, MetricCard, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "@/lib/hooks/skills";
import { CATEGORY_COLOR, CATEGORY_FALLBACK } from "./constants";
import { s } from "./styles";

/** Stats tab — 4 KPI cards + agents-using panel + findings-by-category donut. */
export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills.lab.stats");
  const { data, isLoading, isError, refetch } = useSkillStats(skill.id);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <div style={s.kpiRow}>
          <Skeleton height={88} />
          <Skeleton height={88} />
          <Skeleton height={88} />
          <Skeleton height={88} />
        </div>
        <div style={s.panelsRow}>
          <Skeleton height={200} />
          <Skeleton height={200} />
        </div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div style={s.wrap}>
        <ErrorState body="Could not load stats." onRetry={() => refetch()} />
      </div>
    );
  }

  const segments = data.findings_by_category.map((entry) => ({
    label: entry.category,
    value: entry.value,
    color: CATEGORY_COLOR[entry.category] ?? CATEGORY_FALLBACK,
  }));

  return (
    <div style={s.wrap}>
      <div style={s.kpiRow}>
        <MetricCard label={t("usedBy")} value={t("usedByValue", { count: data.used_by })} />
        <MetricCard label={t("pullFrequency")} value={data.pull_frequency_pct} suffix="%" />
        <div style={s.acceptCard}>
          <div style={s.acceptLabel}>
            <span>{t("acceptRate")}</span>
            <CircularScore score={data.accept_rate_pct} size={28} stroke={3} />
          </div>
          <div style={s.acceptValueRow}>
            <span style={s.acceptValue}>{data.accept_rate_pct}</span>
            <span style={s.acceptSuffix}>%</span>
          </div>
        </div>
        <MetricCard label={t("findings30d")} value={data.findings_count_30d} />
      </div>

      <div style={s.panelsRow}>
        <div style={s.panel}>
          <div style={s.panelHead}>
            <Icon.Cpu size={13} />
            {t("agentsUsingTitle")}
          </div>
          {data.agents_using.length === 0 ? (
            <p style={s.emptyText}>{t("agentsUsingEmpty")}</p>
          ) : (
            <div style={s.agentsList}>
              {data.agents_using.map((a) => (
                <div key={a.id} style={s.agentRow}>
                  <Icon.Cpu size={13} style={{ color: "var(--accent)" }} />
                  <span style={s.agentName}>{a.name}</span>
                  <Link href={`/agents/${a.id}?tab=config`} style={s.agentOpen}>
                    {t("openAgent")}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={s.panel}>
          <div style={s.panelHead}>
            <Icon.Tag size={13} />
            {t("findingsByCategoryTitle")}
          </div>
          {segments.length === 0 ? (
            <p style={s.emptyText}>{t("findingsByCategoryEmpty")}</p>
          ) : (
            <Donut segments={segments} valuePrefix="" />
          )}
        </div>
      </div>
    </div>
  );
}
