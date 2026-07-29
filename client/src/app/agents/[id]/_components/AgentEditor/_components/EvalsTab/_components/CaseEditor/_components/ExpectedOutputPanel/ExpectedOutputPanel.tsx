/* ExpectedOutputPanel — the case editor's right column: the raw JSON editor
   for `ExpectedFinding[]` (the real contract — [] means must-not-flag/decoy,
   1..N means must-find), a live valid/invalid JSON badge, a "+ Finding
   skeleton" template inserter, and the last-run status strip. */
"use client";

import { useTranslations } from "next-intl";
import { Badge, Button, FormField, Icon, Textarea } from "@devdigest/ui";
import { formatCost } from "@/lib/format-cost";
import { appendFindingSkeleton, formatDurationS } from "../../helpers";
import { s } from "../../styles";

export interface LastRunInfo {
  pass: boolean | null;
  expectedCount: number;
  actualCount: number;
  durationMs: number | null;
  costUsd: number | null;
}

export function ExpectedOutputPanel({
  json,
  onJsonChange,
  isValidJson,
  lastRun,
}: {
  json: string;
  onJsonChange: (v: string) => void;
  isValidJson: boolean;
  lastRun?: LastRunInfo;
}) {
  const t = useTranslations("agents.editor.evals.caseEditor");

  return (
    <div style={s.column}>
      <FormField
        label={t("expectedOutput")}
        right={
          <div style={s.expectedHeaderActions}>
            {isValidJson ? (
              <Badge color="var(--ok)" bg="var(--ok-bg)" icon="Check">
                {t("validJson")}
              </Badge>
            ) : (
              <Badge color="var(--crit)" bg="var(--crit-bg)" icon="X">
                {t("invalidJson")}
              </Badge>
            )}
            <Button
              kind="secondary"
              size="sm"
              icon="Plus"
              onClick={() => onJsonChange(appendFindingSkeleton(json))}
            >
              {t("addSkeleton")}
            </Button>
          </div>
        }
      >
        <Textarea mono rows={18} value={json} onChange={onJsonChange} />
      </FormField>

      {lastRun && <StatusStrip lastRun={lastRun} />}
    </div>
  );
}

function StatusStrip({ lastRun }: { lastRun: LastRunInfo }) {
  const t = useTranslations("agents.editor.evals.caseEditor");
  const passed = lastRun.pass === true;
  const duration = formatDurationS(lastRun.durationMs);

  const parts = [t("expectedGot", { n: lastRun.expectedCount, m: lastRun.actualCount })];
  if (duration) parts.push(duration);
  if (lastRun.costUsd != null) parts.push(formatCost(lastRun.costUsd));

  return (
    <div style={{ ...s.statusStrip, ...(passed ? s.statusStripPass : s.statusStripFail) }}>
      {passed ? <Icon.CheckCircle size={14} /> : <Icon.XCircle size={14} />}
      <span>
        {passed ? t("lastRunPassed") : t("lastRunFailed")} · {parts.join(" · ")}
      </span>
    </div>
  );
}
