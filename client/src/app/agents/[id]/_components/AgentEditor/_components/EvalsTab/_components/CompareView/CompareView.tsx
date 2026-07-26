/* CompareView — agent run-all batch history + two-batch compare: per-metric
   deltas (recall/precision/citation-accuracy/cost) plus a system-prompt diff
   between the two agent versions the batches executed under (AC-27/AC-28).
   Scoped to one `agentId`, so only ever offers batches of the SAME agent
   (AC-30). One batch = one run-all execution's aggregated case rows. */
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox } from "@devdigest/ui";
import { useAgentEvalRuns } from "@/lib/hooks/agent-evals";
import { formatCost } from "@/lib/format-cost";
import { useAgentVersionSnapshot } from "./useAgentVersionSnapshot";
import { diffLines, formatMetricDelta, formatCostDeltaSign } from "./helpers";
import { groupRunsByBatch, type EvalBatch } from "../batches";
import { s } from "./styles";

export function CompareView({ agentId }: { agentId: string }) {
  const t = useTranslations("agents.editor.evals.compare");
  const { data: runs } = useAgentEvalRuns(agentId);
  const [selected, setSelected] = useState<string[]>([]);

  const toggleSelect = (batchId: string) => {
    setSelected((prev) => {
      if (prev.includes(batchId)) return prev.filter((id) => id !== batchId);
      if (prev.length >= 2) return prev;
      return [...prev, batchId];
    });
  };

  if (!runs || runs.length === 0) {
    return (
      <div style={s.wrap}>
        <h3 style={s.heading}>{t("heading")}</h3>
        <p style={s.empty}>{t("empty")}</p>
      </div>
    );
  }

  const batches = groupRunsByBatch(runs);
  const selectedBatches = selected
    .map((id) => batches.find((b) => b.batchId === id))
    .filter((b): b is EvalBatch => !!b)
    .sort((a, b) => a.ran_at.localeCompare(b.ran_at));
  const [batchA, batchB] = selectedBatches.length === 2 ? selectedBatches : [undefined, undefined];

  return (
    <div style={s.wrap}>
      <h3 style={s.heading}>{t("heading")}</h3>
      <p style={s.hint}>{t("selectHint")}</p>
      <div style={s.list}>
        {batches.map((b) => (
          <div key={b.batchId} style={s.row}>
            <Checkbox
              checked={selected.includes(b.batchId)}
              onChange={
                selected.length >= 2 && !selected.includes(b.batchId) ? undefined : () => toggleSelect(b.batchId)
              }
              label={
                <div style={s.rowMain}>
                  <span style={s.rowName}>{t("version", { version: b.agent_version ?? "—" })}</span>
                  <span style={s.rowSub}>
                    {new Date(b.ran_at).toLocaleString()} · {formatCost(b.cost_usd)}
                  </span>
                </div>
              }
            />
            <Badge mono color={b.passed === b.total ? "var(--ok)" : "var(--crit)"}>
              {b.passed}/{b.total}
            </Badge>
          </div>
        ))}
      </div>

      {batchA && batchB && <ComparePanel agentId={agentId} batchA={batchA} batchB={batchB} />}
    </div>
  );
}

function ComparePanel({
  agentId,
  batchA,
  batchB,
}: {
  agentId: string;
  batchA: EvalBatch;
  batchB: EvalBatch;
}) {
  const t = useTranslations("agents.editor.evals.compare");
  const versionA = useAgentVersionSnapshot(agentId, batchA.agent_version);
  const versionB = useAgentVersionSnapshot(agentId, batchB.agent_version);

  const costDeltaValue = (batchB.cost_usd ?? 0) - (batchA.cost_usd ?? 0);
  const deltas = [
    { label: t("recall"), text: formatMetricDelta(batchB.recall - batchA.recall) },
    { label: t("precision"), text: formatMetricDelta(batchB.precision - batchA.precision) },
    {
      label: t("citationAccuracy"),
      text: formatMetricDelta(batchB.citation_accuracy - batchA.citation_accuracy),
    },
    { label: t("cost"), text: `${formatCostDeltaSign(costDeltaValue)}${formatCost(Math.abs(costDeltaValue))}` },
  ];

  return (
    <div style={s.panel} data-testid="compare-panel">
      <h4 style={s.heading}>{t("delta")}</h4>
      {deltas.map((d) => (
        <div key={d.label} style={s.deltaRow}>
          <span>{d.label}</span>
          <span className="mono tnum">{d.text}</span>
        </div>
      ))}

      <h4 style={{ ...s.heading, marginTop: 16 }}>{t("promptDiff")}</h4>
      {versionA.data && versionB.data ? (
        <div>
          {diffLines(versionA.data.config.system_prompt, versionB.data.config.system_prompt).map((line, i) => (
            <div key={i} style={s.diffLine(line.kind)}>
              {line.kind === "add" ? "+ " : line.kind === "del" ? "- " : "  "}
              {line.text}
            </div>
          ))}
        </div>
      ) : (
        <p style={s.empty}>{t("versionUnavailable")}</p>
      )}
    </div>
  );
}
