/* CompareView — agent eval run history + two-run compare: per-metric deltas
   (recall/precision/citation-accuracy/cost) plus a system-prompt diff between
   the two agent versions the runs executed under. Scoped to one `agentId`, so
   only ever offers runs of the SAME agent (AC-30). */
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox } from "@devdigest/ui";
import type { EvalRunRecord } from "@devdigest/shared";
import { useAgentEvalRuns } from "@/lib/hooks/agent-evals";
import { formatCost } from "@/lib/format-cost";
import { useAgentVersionSnapshot } from "./useAgentVersionSnapshot";
import { diffLines, formatMetricDelta, formatCostDeltaSign } from "./helpers";
import { s } from "./styles";

export function CompareView({ agentId }: { agentId: string }) {
  const t = useTranslations("agents.editor.evals.compare");
  const { data: runs } = useAgentEvalRuns(agentId);
  const [selected, setSelected] = useState<string[]>([]);

  const toggleSelect = (runId: string) => {
    setSelected((prev) => {
      if (prev.includes(runId)) return prev.filter((id) => id !== runId);
      if (prev.length >= 2) return prev;
      return [...prev, runId];
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

  const sorted = [...runs].sort((a, b) => a.ran_at.localeCompare(b.ran_at));
  const selectedRuns = selected
    .map((id) => runs.find((r) => r.id === id))
    .filter((r): r is EvalRunRecord => !!r)
    .sort((a, b) => a.ran_at.localeCompare(b.ran_at));
  const [runA, runB] = selectedRuns.length === 2 ? selectedRuns : [undefined, undefined];

  return (
    <div style={s.wrap}>
      <h3 style={s.heading}>{t("heading")}</h3>
      <p style={s.hint}>{t("selectHint")}</p>
      <div style={s.list}>
        {sorted.map((r) => (
          <div key={r.id} style={s.row}>
            <Checkbox
              checked={selected.includes(r.id)}
              onChange={
                selected.length >= 2 && !selected.includes(r.id) ? undefined : () => toggleSelect(r.id)
              }
              label={
                <div style={s.rowMain}>
                  <span style={s.rowName}>{r.case_name ?? r.case_id}</span>
                  <span style={s.rowSub}>
                    {new Date(r.ran_at).toLocaleString()} ·{" "}
                    {t("version", { version: r.agent_version ?? "—" })} · {formatCost(r.cost_usd)}
                  </span>
                </div>
              }
            />
            <Badge mono color={r.pass ? "var(--ok)" : "var(--crit)"}>
              {r.pass ? "pass" : "fail"}
            </Badge>
          </div>
        ))}
      </div>

      {runA && runB && <ComparePanel agentId={agentId} runA={runA} runB={runB} />}
    </div>
  );
}

function ComparePanel({
  agentId,
  runA,
  runB,
}: {
  agentId: string;
  runA: EvalRunRecord;
  runB: EvalRunRecord;
}) {
  const t = useTranslations("agents.editor.evals.compare");
  const versionA = useAgentVersionSnapshot(agentId, runA.agent_version);
  const versionB = useAgentVersionSnapshot(agentId, runB.agent_version);

  const costDeltaValue = (runB.cost_usd ?? 0) - (runA.cost_usd ?? 0);
  const deltas = [
    { label: t("recall"), text: formatMetricDelta((runB.recall ?? 0) - (runA.recall ?? 0)) },
    { label: t("precision"), text: formatMetricDelta((runB.precision ?? 0) - (runA.precision ?? 0)) },
    {
      label: t("citationAccuracy"),
      text: formatMetricDelta((runB.citation_accuracy ?? 0) - (runA.citation_accuracy ?? 0)),
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
