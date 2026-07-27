/* EvalsTab — agent eval cases: per-agent metrics header, case list, run all
   (estimate → confirm → run) and per-case run/edit/delete. Mirrors the Skill
   Evals tab (client/src/app/skills/[id]/_components/SkillDetail/_components/EvalsTab). */
"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, MetricCard, SectionLabel, Skeleton } from "@devdigest/ui";
import {
  useAgentEvalCase,
  useAgentEvalDashboard,
  useAgentEvalRunsEstimate,
  useAgentEvals,
  useDeleteAgentEvalCase,
  useRunAgentEvalCase,
  useRunAgentEvals,
} from "@/lib/hooks/agent-evals";
import { CaseEditor } from "./_components/CaseEditor";
import { EvalCaseRow } from "./_components/EvalCaseRow";
import { s } from "./styles";

export function EvalsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents.editor.evals");
  const [confirmingRunAll, setConfirmingRunAll] = useState(false);
  const [caseEditorOpen, setCaseEditorOpen] = useState(false);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useAgentEvals(agentId);
  const dashboard = useAgentEvalDashboard(agentId);
  const estimate = useAgentEvalRunsEstimate(agentId);
  const runAll = useRunAgentEvals(agentId);
  const runOne = useRunAgentEvalCase(agentId);
  const deleteCase = useDeleteAgentEvalCase(agentId);
  const editingCase = useAgentEvalCase(agentId, editingCaseId);

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
  const editingSummary = data.find((c) => c.id === editingCaseId);

  const handleRunAllClick = () => setConfirmingRunAll(true);
  const handleCancelRunAll = () => setConfirmingRunAll(false);
  const handleConfirmRunAll = () => {
    setConfirmingRunAll(false);
    runAll.mutate();
  };

  return (
    <div style={s.wrap}>
      {dashboard.data && (
        <>
          <SectionLabel
            icon="Gauge"
            right={
              <Link href={`/eval/${agentId}`} style={s.metricsLink}>
                {t("metrics.viewDashboard")}
              </Link>
            }
          >
            {t("metrics.heading")}
          </SectionLabel>
          <div style={s.metricsRow}>
            <MetricCard
              label={t("metrics.recall")}
              value={Math.round(dashboard.data.current.recall * 100)}
              suffix="%"
              delta={dashboard.data.delta.recall * 100}
            />
            <MetricCard
              label={t("metrics.precision")}
              value={Math.round(dashboard.data.current.precision * 100)}
              suffix="%"
              delta={dashboard.data.delta.precision * 100}
            />
            <MetricCard
              label={t("metrics.citationAccuracy")}
              value={Math.round(dashboard.data.current.citation_accuracy * 100)}
              suffix="%"
              delta={dashboard.data.delta.citation_accuracy * 100}
            />
            <MetricCard
              label={t("metrics.tracesPassed")}
              value={`${dashboard.data.current.traces_passed}/${dashboard.data.current.traces_total}`}
            />
          </div>
        </>
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
          <Button kind="primary" size="sm" icon="Plus" onClick={() => setCaseEditorOpen(true)}>
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
              isDeleting={deleteCase.isPending && deleteCase.variables === c.id}
              onRun={() => runOne.mutate(c.id)}
              onEdit={() => setEditingCaseId(c.id)}
              onDelete={() => {
                if (window.confirm(t("deleteConfirm", { name: c.name }))) deleteCase.mutate(c.id);
              }}
            />
          ))}
        </div>
      )}

      {caseEditorOpen && <CaseEditor agentId={agentId} onClose={() => setCaseEditorOpen(false)} />}

      {editingCaseId && editingCase.data && (
        <CaseEditor
          agentId={agentId}
          caseId={editingCaseId}
          initialCase={editingCase.data}
          summary={editingSummary}
          onClose={() => setEditingCaseId(null)}
        />
      )}
    </div>
  );
}
