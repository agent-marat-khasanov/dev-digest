/* /eval — Eval Dashboard (Screen 1). Agent cards (icon, model, last run,
   sparkline, headline metrics) each linking to /eval/:agentId, plus a
   "recent eval runs" table across the whole workspace. "Run all agents" is
   gated by a cost estimate + explicit confirm. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import {
  useEvalDashboardOverview,
  useEvalRunsEstimate,
  useRunAllAgentEvals,
} from "@/lib/hooks/agent-evals";
import { MetricBarCell } from "../MetricBarCell";
import { AgentEvalCard } from "./_components/AgentEvalCard";
import { formatCost, formatRanAt } from "./helpers";
import { s } from "./styles";

const CRUMB = [{ label: "Skills Lab" }, { label: "Eval Dashboard" }];

export function EvalDashboardView() {
  const t = useTranslations("evalDashboard.list");
  const { data, isLoading, isError, refetch } = useEvalDashboardOverview();
  const estimate = useEvalRunsEstimate();
  const runAll = useRunAllAgentEvals();
  const [confirming, setConfirming] = React.useState(false);

  if (isLoading) {
    return (
      <AppShell crumb={CRUMB}>
        <div style={s.page}>
          <Skeleton height={32} width={280} />
          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            <Skeleton height={72} />
            <Skeleton height={72} />
            <Skeleton height={72} />
          </div>
        </div>
      </AppShell>
    );
  }

  if (isError || !data) {
    return (
      <AppShell crumb={CRUMB}>
        <div style={s.page}>
          <ErrorState body={t("loadError")} onRetry={() => refetch()} />
        </div>
      </AppShell>
    );
  }

  const isEmpty = data.agents.length === 0 && data.recent_runs.length === 0;

  return (
    <AppShell crumb={CRUMB}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("title")}</h1>
            <p style={s.subtitle}>{t("subtitle")}</p>
          </div>
          <Button
            kind="primary"
            size="sm"
            icon="Play"
            disabled={runAll.isPending || data.agents.length === 0}
            onClick={() => setConfirming(true)}
          >
            {runAll.isPending ? t("running") : t("runAll")}
          </Button>
        </div>

        {confirming && (
          <div style={s.confirmBar}>
            {estimate.isLoading && <Skeleton height={16} width={320} />}
            {estimate.isError && <div style={s.confirmBody}>{t("estimateError")}</div>}
            {estimate.data && (
              <div style={s.confirmBody}>
                {t("confirmBody", {
                  caseCount: estimate.data.case_count,
                  agentCount: estimate.data.agent_count,
                  cost: formatCost(estimate.data.estimated_cost_usd),
                })}
              </div>
            )}
            <div style={s.confirmActions}>
              <Button kind="ghost" size="sm" onClick={() => setConfirming(false)}>
                {t("cancel")}
              </Button>
              <Button
                kind="primary"
                size="sm"
                loading={runAll.isPending}
                disabled={!estimate.data || runAll.isPending}
                onClick={() => runAll.mutate(undefined, { onSuccess: () => setConfirming(false) })}
              >
                {t("confirmCta")}
              </Button>
            </div>
          </div>
        )}

        {isEmpty ? (
          <EmptyState icon="FlaskConical" title={t("emptyTitle")} body={t("emptyBody")} />
        ) : (
          <>
            <div style={s.section}>
              <SectionLabel icon="Cpu">{t("agentsHeading")}</SectionLabel>
              <div style={s.cardList}>
                {data.agents.map((agent) => (
                  <AgentEvalCard key={agent.agent_id} agent={agent} />
                ))}
              </div>
            </div>

            <div style={s.section}>
              <SectionLabel icon="History">{t("recentRunsHeading")}</SectionLabel>
              {data.recent_runs.length === 0 ? (
                <p style={s.noRecentRuns}>{t("noRecentRuns")}</p>
              ) : (
                <div style={s.runsTable}>
                  <div style={s.runsHeadRow}>
                    <span>{t("columns.agent")}</span>
                    <span>{t("columns.ranAt")}</span>
                    <span>{t("columns.version")}</span>
                    <span>{t("columns.recall")}</span>
                    <span>{t("columns.precision")}</span>
                    <span>{t("columns.citation")}</span>
                    <span>{t("columns.pass")}</span>
                  </div>
                  {data.recent_runs.map((run) => (
                    <div key={run.batch_id} style={s.runsRow}>
                      <span style={s.runAgentName}>{run.agent_name}</span>
                      <span className="mono" style={s.runRanAt}>
                        {formatRanAt(run.ran_at)}
                      </span>
                      <Link href={`/eval/${run.agent_id}`} className="mono" style={s.versionLink}>
                        v{run.agent_version ?? "—"}
                      </Link>
                      <MetricBarCell value={run.recall} color="var(--accent)" />
                      <MetricBarCell value={run.precision} color="var(--ok)" />
                      <MetricBarCell value={run.citation_accuracy} color="var(--warn)" />
                      <span style={s.runPass}>
                        {run.passed}/{run.total}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
