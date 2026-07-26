/* EvalsTab — agent eval cases: per-agent metrics header, case list, run all
   (estimate → confirm → run) and per-case run. Mirrors the Skill Evals tab
   (client/src/app/skills/[id]/_components/SkillDetail/_components/EvalsTab). */
"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, MetricCard, Skeleton } from "@devdigest/ui";
import {
  useAgentEvalDashboard,
  useAgentEvalRunsEstimate,
  useAgentEvals,
  useRunAgentEvalCase,
  useRunAgentEvals,
} from "@/lib/hooks/agent-evals";
import { useToast } from "@/lib/toast";
import { EvalCaseRow } from "./_components/EvalCaseRow";
import { s } from "./styles";

export function EvalsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents.editor.evals");
  const toast = useToast();
  const [confirmingRunAll, setConfirmingRunAll] = useState(false);

  const { data, isLoading, isError, refetch } = useAgentEvals(agentId);
  const dashboard = useAgentEvalDashboard(agentId);
  const estimate = useAgentEvalRunsEstimate(agentId);
  const runAll = useRunAgentEvals(agentId);
  const runOne = useRunAgentEvalCase(agentId);

  const comingSoon = () => toast.info(t("comingSoon"));

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={28} width={260} />
        <div style={{ ...s.list, marginTop: 16 }}>
          <Skeleton height={58} />
          <Skeleton height={58} />
          <Skeleton height={58} />
        </div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div style={s.wrap}>
        <ErrorState body={t("loadError")} onRetry={() => refetch()} />
      </div>
    );
  }

  const passed = data.filter((c) => c.last_run?.pass === true).length;

  const handleRunAllClick = () => setConfirmingRunAll(true);
  const handleCancelRunAll = () => setConfirmingRunAll(false);
  const handleConfirmRunAll = () => {
    setConfirmingRunAll(false);
    runAll.mutate();
  };

  return (
    <div style={s.wrap}>
      {dashboard.data && (
        <div style={s.metricsRow}>
          <MetricCard label={t("metrics.recall")} value={dashboard.data.current.recall.toFixed(2)} />
          <MetricCard label={t("metrics.precision")} value={dashboard.data.current.precision.toFixed(2)} />
          <MetricCard
            label={t("metrics.citationAccuracy")}
            value={dashboard.data.current.citation_accuracy.toFixed(2)}
          />
          <Link href="/eval" style={s.metricsLink}>
            {t("metrics.viewDashboard")}
          </Link>
        </div>
      )}

      <div style={s.headerRow}>
        <h2 style={s.heading}>{t("casesHeading")}</h2>
        {data.length > 0 && (
          <Badge color="var(--warn)" bg="var(--warn-bg)">
            {t("passing", { passed, total: data.length })}
          </Badge>
        )}
        <div style={s.headerActions}>
          <Button
            kind="secondary"
            size="sm"
            icon="Play"
            loading={runAll.isPending}
            disabled={runAll.isPending || confirmingRunAll || data.length === 0}
            onClick={handleRunAllClick}
          >
            {runAll.isPending ? t("running") : t("runAll")}
          </Button>
          <Button kind="primary" size="sm" icon="Plus" onClick={comingSoon}>
            {t("newCase")}
          </Button>
        </div>
      </div>

      {confirmingRunAll && (
        <div style={s.confirmBar}>
          <span style={s.confirmText}>
            {estimate.isLoading || !estimate.data
              ? t("estimating")
              : t("confirmRunAll", {
                  count: estimate.data.case_count,
                  cost: estimate.data.estimated_cost_usd.toFixed(4),
                })}
          </span>
          <div style={s.confirmActions}>
            <Button kind="ghost" size="sm" onClick={handleCancelRunAll}>
              {t("cancel")}
            </Button>
            <Button
              kind="primary"
              size="sm"
              disabled={estimate.isLoading || !estimate.data}
              onClick={handleConfirmRunAll}
            >
              {t("confirm")}
            </Button>
          </div>
        </div>
      )}

      {data.length === 0 ? (
        <div style={s.empty}>
          <Icon.FlaskConical size={40} style={s.emptyIcon} />
          <h3 style={s.emptyTitle}>{t("emptyTitle")}</h3>
          <p style={s.emptyBody}>{t("emptyBody")}</p>
        </div>
      ) : (
        <div style={s.list}>
          {data.map((c) => (
            <EvalCaseRow
              key={c.id}
              summary={c}
              isRunning={runAll.isPending || (runOne.isPending && runOne.variables === c.id)}
              onRun={() => runOne.mutate(c.id)}
            />
          ))}
        </div>
      )}

      {/* Mount point for T10 (CompareView) / T12 (TrendChart) — run history over this agent's
          eval runs. Left as a structural placeholder so those tasks attach without a rewrite. */}
    </div>
  );
}
