/* CompareModal — Screen 3. Two-run metric-transition cards + a system-prompt
   diff between the two agent versions the runs executed under, with a
   "Promote v{new}" action that applies the newer snapshot's config to the
   agent (PUT /agents/:id). Prompt lines render as plain text nodes only —
   never dangerouslySetInnerHTML — so the diff stays inert. */
"use client";

import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { formatCost } from "@/lib/format-cost";
import { notify } from "@/lib/toast";
import { useUpdateAgent } from "@/lib/hooks/agents";
import type { EvalRunBatch } from "@devdigest/shared";
import { useAgentVersionSnapshot } from "@/lib/hooks/agent-evals";
import { diffLines, formatCostDelta, formatPctTransition, formatPointDelta } from "./helpers";
import { s } from "./styles";

export function CompareModal({
  agentId,
  casesTotal,
  older,
  newer,
  onClose,
}: {
  agentId: string;
  casesTotal: number;
  older: EvalRunBatch;
  newer: EvalRunBatch;
  onClose: () => void;
}) {
  const t = useTranslations("evalDashboard.agent.compare");
  const versionOlder = useAgentVersionSnapshot(agentId, older.agent_version);
  const versionNewer = useAgentVersionSnapshot(agentId, newer.agent_version);
  const promote = useUpdateAgent();

  const recall = formatPctTransition(older.recall, newer.recall);
  const recallDelta = formatPointDelta(older.recall, newer.recall);
  const precision = formatPctTransition(older.precision, newer.precision);
  const precisionDelta = formatPointDelta(older.precision, newer.precision);
  const citation = formatPctTransition(older.citation_accuracy, newer.citation_accuracy);
  const citationDelta = formatPointDelta(older.citation_accuracy, newer.citation_accuracy);
  const costDelta = formatCostDelta(older.cost_usd ?? 0, newer.cost_usd ?? 0);

  const handlePromote = () => {
    const config = versionNewer.data?.config;
    if (!config) return;
    promote.mutate(
      {
        id: agentId,
        patch: {
          provider: config.provider,
          model: config.model,
          system_prompt: config.system_prompt,
          strategy: config.strategy,
          ci_fail_on: config.ci_fail_on,
          repo_intel: config.repo_intel,
        },
      },
      {
        onSuccess: () => {
          notify.success(t("promoteSuccess", { version: newer.agent_version ?? "—" }));
          onClose();
        },
        onError: () => notify.error(t("promoteError")),
      },
    );
  };

  return (
    <Modal
      width={760}
      title={t("title", { older: older.agent_version ?? "—", newer: newer.agent_version ?? "—" })}
      subtitle={t("subtitle", { count: casesTotal })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("close")}
          </Button>
          <Button
            kind="primary"
            icon="GitBranch"
            loading={promote.isPending}
            disabled={!versionNewer.data || promote.isPending}
            onClick={handlePromote}
          >
            {t("promote", { version: newer.agent_version ?? "—" })}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.transitions}>
          <TransitionCard label={t("recall")} older={recall.older} newer={recall.newer} delta={recallDelta} />
          <TransitionCard label={t("precision")} older={precision.older} newer={precision.newer} delta={precisionDelta} />
          <TransitionCard label={t("citation")} older={citation.older} newer={citation.newer} delta={citationDelta} />
          <TransitionCard
            label={t("cost")}
            older={formatCost(older.cost_usd)}
            newer={formatCost(newer.cost_usd)}
            delta={costDelta}
          />
        </div>

        <div style={s.diffSection}>
          <div style={s.diffHeading}>{t("promptDiffHeading")}</div>
          <div style={s.legend}>
            <span style={s.legendChip("var(--text-muted)")}>{t("legendOld", { version: older.agent_version ?? "—" })}</span>
            <span style={s.legendChip("var(--ok)")}>{t("legendNew", { version: newer.agent_version ?? "—" })}</span>
          </div>
          {versionOlder.data && versionNewer.data ? (
            <div style={s.diffBox}>
              {diffLines(versionOlder.data.config.system_prompt, versionNewer.data.config.system_prompt).map(
                (line, i) => (
                  <div key={i} style={s.diffLine(line.kind)}>
                    {line.kind === "add" ? "+ " : line.kind === "del" ? "- " : "  "}
                    {line.text}
                  </div>
                ),
              )}
            </div>
          ) : (
            <p style={s.versionUnavailable}>{t("versionUnavailable")}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function TransitionCard({
  label,
  older,
  newer,
  delta,
}: {
  label: string;
  older: string;
  newer: string;
  delta: { text: string; up: boolean; flat: boolean };
}) {
  return (
    <div style={s.transitionCard}>
      <div style={s.transitionLabel}>{label}</div>
      <div style={s.transitionValues}>
        <span style={s.transitionOld}>{older}</span>
        <span style={s.transitionArrow}>→</span>
        <span style={s.transitionNew}>{newer}</span>
      </div>
      <span style={s.transitionDelta(delta.up, delta.flat)}>{delta.text}</span>
    </div>
  );
}
