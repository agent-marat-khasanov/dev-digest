/* RunsTable — Screen 2's "RECENT RUNS" panel: per-batch rows with a checkbox
   (max 2 selected) driving the parent's Compare modal. */
import { useTranslations } from "next-intl";
import { Button, Checkbox } from "@devdigest/ui";
import { formatCost } from "@/lib/format-cost";
import type { EvalRunBatch } from "@devdigest/shared";
import { MetricBarCell } from "../../../../../_components/MetricBarCell";
import { s } from "./styles";

export function RunsTable({
  runs,
  selected,
  onToggle,
  onCompare,
}: {
  runs: EvalRunBatch[];
  selected: string[];
  onToggle: (batchId: string) => void;
  onCompare: () => void;
}) {
  const t = useTranslations("evalDashboard.agent.runs");

  return (
    <div style={s.wrap}>
      <div style={s.headerRow}>
        <span style={s.heading}>{t("heading")}</span>
        <span style={s.selectedCount}>{t("selected", { count: selected.length })}</span>
        <Button kind="primary" size="sm" disabled={selected.length !== 2} onClick={onCompare}>
          {t("compare")}
        </Button>
      </div>

      {runs.length === 0 ? (
        <p style={s.empty}>{t("empty")}</p>
      ) : (
        <div style={s.table}>
          <div style={s.headRow}>
            <span />
            <span>{t("columns.ranAt")}</span>
            <span>{t("columns.version")}</span>
            <span>{t("columns.recall")}</span>
            <span>{t("columns.precision")}</span>
            <span>{t("columns.citation")}</span>
            <span>{t("columns.pass")}</span>
            <span>{t("columns.cost")}</span>
          </div>
          {runs.map((run) => {
            const isSelected = selected.includes(run.batch_id);
            const atLimit = selected.length >= 2 && !isSelected;
            return (
              <div key={run.batch_id} style={s.row}>
                <Checkbox checked={isSelected} onChange={atLimit ? undefined : () => onToggle(run.batch_id)} />
                <span className="mono" style={s.ranAt}>
                  {new Date(run.ran_at).toLocaleString()}
                </span>
                <span className="mono" style={s.version}>
                  v{run.agent_version ?? "—"}
                </span>
                <MetricBarCell value={run.recall} color="var(--accent)" />
                <MetricBarCell value={run.precision} color="var(--ok)" />
                <MetricBarCell value={run.citation_accuracy} color="var(--warn)" />
                <span style={s.pass}>
                  {run.passed}/{run.total}
                </span>
                <span className="mono" style={s.cost}>
                  {formatCost(run.cost_usd)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
