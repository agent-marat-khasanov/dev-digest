/* /eval — Eval Dashboard. Per-agent regression rows + recent runs across the
   workspace, with a "Run all agents" action gated by a cost estimate +
   explicit confirm. Mirrors the skill Evals tab layout at dashboard scale. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import {
  useEvalDashboardOverview,
  useEvalRunsEstimate,
  useRunAllAgentEvals,
} from "@/lib/hooks/agent-evals";
import { formatCost, formatMetric } from "./helpers";
import { s } from "./styles";

export function EvalDashboardView() {
  const t = useTranslations("evalDashboard");
  const { data, isLoading, isError, refetch } = useEvalDashboardOverview();
  const estimate = useEvalRunsEstimate();
  const runAll = useRunAllAgentEvals();
  const [confirming, setConfirming] = React.useState(false);

  if (isLoading) {
    return (
      <AppShell crumb={[{ label: t("title") }]}>
        <div style={s.page}>
          <Skeleton height={32} width={280} />
          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            <Skeleton height={54} />
            <Skeleton height={54} />
            <Skeleton height={54} />
          </div>
        </div>
      </AppShell>
    );
  }

  if (isError || !data) {
    return (
      <AppShell crumb={[{ label: t("title") }]}>
        <div style={s.page}>
          <ErrorState body={t("loadError")} onRetry={() => refetch()} />
        </div>
      </AppShell>
    );
  }

  const isEmpty = data.recent_runs.length === 0;

  return (
    <AppShell crumb={[{ label: t("title") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("title")}</h1>
            <p style={s.subtitle}>{t("subtitle")}</p>
          </div>
          <Button
            kind="secondary"
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
          <EmptyState
            icon="FlaskConical"
            title={t("emptyTitle")}
            body={t("emptyBody")}
          />
        ) : (
          <>
            <div style={s.section}>
              <h2 style={s.sectionHeading}>{t("agentsHeading")}</h2>
              <div style={s.table}>
                <div style={s.headRow}>
                  <span>{t("columns.agent")}</span>
                  <span>{t("columns.recall")}</span>
                  <span>{t("columns.precision")}</span>
                  <span>{t("columns.citation")}</span>
                  <span>{t("columns.lastRun")}</span>
                </div>
                {data.agents.map((agent) => (
                  <Link key={agent.agent_id} href={`/agents/${agent.agent_id}?tab=evals`} style={s.row}>
                    <span style={s.agentName}>{agent.agent_name}</span>
                    <span style={s.metric}>{formatMetric(agent.recall)}</span>
                    <span style={s.metric}>{formatMetric(agent.precision)}</span>
                    <span style={s.metric}>{formatMetric(agent.citation_accuracy)}</span>
                    <span style={s.passCount}>
                      {agent.last_run_pass_count
                        ? t("passCount", {
                            passed: agent.last_run_pass_count.passed,
                            total: agent.last_run_pass_count.total,
                          })
                        : t("neverRun")}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            <div style={s.section}>
              <h2 style={s.sectionHeading}>{t("recentRunsHeading")}</h2>
              {data.recent_runs.length === 0 ? (
                <p style={s.metric}>{t("noRecentRuns")}</p>
              ) : (
                <div style={s.runsList}>
                  {data.recent_runs.map((run) => (
                    <div key={run.id} style={s.runRow}>
                      <span style={s.runName}>{run.case_name ?? run.case_id}</span>
                      <span>{new Date(run.ran_at).toLocaleString()}</span>
                      <span>{formatMetric(run.recall)}</span>
                      <span>{formatMetric(run.precision)}</span>
                      <span>{formatMetric(run.citation_accuracy)}</span>
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
