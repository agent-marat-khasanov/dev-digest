/* /eval/:agentId — one agent's eval dashboard (Screen 2): headline metric
   cards with delta + sparkline, a METRIC TREND line chart, and a RECENT RUNS
   table that feeds the two-run Compare modal (Screen 3). "Run eval" is
   gated by the same cost estimate → confirm pattern as the workspace-wide
   "Run all agents" action. */
"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  ErrorState,
  Icon,
  LineChart,
  MetricCard,
  SectionLabel,
  SelectInput,
  Skeleton,
} from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useAgent, useAgents } from "@/lib/hooks/agents";
import {
  useAgentEvalDashboard,
  useAgentEvalRunsEstimate,
  useRunAgentEvals,
} from "@/lib/hooks/agent-evals";
import type { EvalRunBatch } from "@devdigest/shared";
import { RunsTable } from "./_components/RunsTable";
import { CompareModal } from "./_components/CompareModal";
import { formatEstimateCost } from "./helpers";
import { s } from "./styles";

export function AgentEvalDashboardView() {
  const t = useTranslations("evalDashboard.agent");
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const router = useRouter();

  const { data: agents } = useAgents();
  const { data: agent, isLoading: agentLoading } = useAgent(agentId);
  const dashboard = useAgentEvalDashboard(agentId);
  const estimate = useAgentEvalRunsEstimate(agentId);
  const runEval = useRunAgentEvals(agentId);

  const [confirming, setConfirming] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [comparing, setComparing] = React.useState(false);

  const crumb = [
    { label: "Skills Lab" },
    { label: "Eval Dashboard", href: "/eval" },
    { label: agent?.name ?? "Agent" },
  ];

  if (agentLoading || dashboard.isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <Skeleton height={16} width={100} />
          <Skeleton height={32} width={320} style={{ marginTop: 14 }} />
          <div style={{ marginTop: 20, display: "flex", gap: 14 }}>
            <Skeleton height={100} />
            <Skeleton height={100} />
            <Skeleton height={100} />
          </div>
        </div>
      </AppShell>
    );
  }

  if (dashboard.isError || !dashboard.data || !agent) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <ErrorState body={t("loadError")} onRetry={() => dashboard.refetch()} />
        </div>
      </AppShell>
    );
  }

  const d = dashboard.data;
  const recallTrend = d.trend.map((p) => p.recall);
  const precisionTrend = d.trend.map((p) => p.precision);
  const citationTrend = d.trend.map((p) => p.citation_accuracy);

  const toggleRun = (batchId: string) => {
    setSelected((prev) => {
      if (prev.includes(batchId)) return prev.filter((id) => id !== batchId);
      if (prev.length >= 2) return prev;
      return [...prev, batchId];
    });
  };

  const selectedBatches = selected
    .map((id) => d.recent_runs.find((r) => r.batch_id === id))
    .filter((r): r is EvalRunBatch => !!r)
    .sort((a, b) => a.ran_at.localeCompare(b.ran_at));
  const [olderBatch, newerBatch] = selectedBatches.length === 2 ? selectedBatches : [undefined, undefined];

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <Link href="/eval" style={s.backLink}>
          {t("back")}
        </Link>

        <div style={s.headerRow}>
          <div style={s.headerText}>
            <div style={s.titleRow}>
              <h1 style={s.h1}>{agent.name}</h1>
              <Badge mono color="var(--text-secondary)">
                {agent.model}
              </Badge>
            </div>
            <p style={s.subtitle}>
              {t("subtitle", { runsTotal: d.runs_total, casesTotal: d.cases_total })}
            </p>
          </div>
          <div style={s.controls}>
            <div style={s.agentSelect}>
              <SelectInput
                value={agentId}
                onChange={(id) => router.push(`/eval/${id}`)}
                options={(agents ?? []).map((a) => ({ value: a.id, label: a.name }))}
              />
            </div>
            <div style={s.rangeSelect}>
              <SelectInput value="30d" options={[{ value: "30d", label: t("range") }]} />
            </div>
            <Button
              kind="primary"
              size="sm"
              icon="Play"
              disabled={runEval.isPending || confirming}
              onClick={() => setConfirming(true)}
            >
              {runEval.isPending ? t("running") : t("runEval")}
            </Button>
          </div>
        </div>

        {confirming && (
          <div style={s.confirmBar}>
            {estimate.isLoading && <Skeleton height={16} width={280} />}
            {estimate.isError && <div style={s.confirmBody}>{t("estimateError")}</div>}
            {estimate.data && (
              <div style={s.confirmBody}>
                {t("confirmBody", {
                  caseCount: estimate.data.case_count,
                  cost: formatEstimateCost(estimate.data.estimated_cost_usd),
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
                loading={runEval.isPending}
                disabled={!estimate.data || runEval.isPending}
                onClick={() => runEval.mutate(undefined, { onSuccess: () => setConfirming(false) })}
              >
                {t("confirmCta")}
              </Button>
            </div>
          </div>
        )}

        {d.alert && (
          <div style={s.alertBanner}>
            <Icon.AlertTriangle size={16} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1 }} />
            <span>{d.alert}</span>
          </div>
        )}

        <div style={s.metricsRow}>
          <MetricCard
            label={t("metrics.recall")}
            value={Math.round(d.current.recall * 100)}
            suffix="%"
            delta={d.delta.recall}
            color="var(--accent)"
            trend={recallTrend}
          />
          <MetricCard
            label={t("metrics.precision")}
            value={Math.round(d.current.precision * 100)}
            suffix="%"
            delta={d.delta.precision}
            color="var(--ok)"
            trend={precisionTrend}
          />
          <MetricCard
            label={t("metrics.citation")}
            value={Math.round(d.current.citation_accuracy * 100)}
            suffix="%"
            delta={d.delta.citation_accuracy}
            color="var(--warn)"
            trend={citationTrend}
          />
        </div>

        <div style={s.trendPanel}>
          <SectionLabel
            icon="TrendingUp"
            right={
              <div style={s.legend}>
                <span style={s.legendItem}>
                  <span style={s.legendDash("var(--accent)")} />
                  {t("trend.recall")}
                </span>
                <span style={s.legendItem}>
                  <span style={s.legendDash("var(--ok)")} />
                  {t("trend.precision")}
                </span>
                <span style={s.legendItem}>
                  <span style={s.legendDash("var(--warn)")} />
                  {t("trend.citation")}
                </span>
              </div>
            }
          >
            {t("trend.heading")}
          </SectionLabel>
          <LineChart
            series={[
              { name: "recall", color: "var(--accent)", data: recallTrend },
              { name: "precision", color: "var(--ok)", data: precisionTrend },
              { name: "citation", color: "var(--warn)", data: citationTrend },
            ]}
            yMin={0.6}
            yMax={1.0}
          />
        </div>

        <RunsTable
          runs={d.recent_runs}
          selected={selected}
          onToggle={toggleRun}
          onCompare={() => setComparing(true)}
        />

        {comparing && olderBatch && newerBatch && (
          <CompareModal
            agentId={agentId}
            casesTotal={d.cases_total}
            older={olderBatch}
            newer={newerBatch}
            onClose={() => setComparing(false)}
          />
        )}
      </div>
    </AppShell>
  );
}
