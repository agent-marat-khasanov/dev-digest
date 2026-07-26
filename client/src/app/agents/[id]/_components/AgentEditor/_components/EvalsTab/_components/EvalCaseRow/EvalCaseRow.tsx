/* EvalCaseRow — one agent eval case: status icon + name + expected/got line + badge + run action. */
"use client";

import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { EvalCaseSummary } from "@devdigest/shared";
import { SEVERITY_COLOR } from "../../constants";
import { s } from "../../styles";

const spin = { animation: "ddspin 1s linear infinite" } as const;

export function EvalCaseRow({
  summary,
  isRunning,
  onRun,
}: {
  summary: EvalCaseSummary;
  isRunning: boolean;
  onRun: () => void;
}) {
  const t = useTranslations("agents.editor.evals");
  const { last_run, primary, expected_count } = summary;

  return (
    <div style={s.row}>
      <StatusIcon pass={last_run ? last_run.pass : undefined} />

      <div style={s.rowMain}>
        <span className="mono" style={s.name}>
          {summary.name}
        </span>
        <span style={s.sub}>
          {last_run
            ? t("expectedGot", { n: expected_count, m: last_run.actual_count })
            : t("neverRun", { n: expected_count })}
        </span>
      </div>

      {primary ? (
        <Badge
          mono
          color={SEVERITY_COLOR[primary.severity].color}
          bg={SEVERITY_COLOR[primary.severity].bg}
        >
          {primary.severity} · {primary.category}
        </Badge>
      ) : (
        <Badge mono color="var(--text-muted)">
          {t("emptyBadge")}
        </Badge>
      )}

      <div style={s.actions}>
        <button
          onClick={onRun}
          disabled={isRunning}
          title={t("run")}
          aria-label={t("run")}
          style={s.iconBtn(isRunning)}
        >
          <Icon.Play size={15} style={isRunning ? spin : undefined} />
        </button>
      </div>
    </div>
  );
}

/** Green check when the latest run passed, red cross when it failed, hollow dot when never run. */
function StatusIcon({ pass }: { pass: boolean | null | undefined }) {
  if (pass === undefined) return <span style={s.neverRunDot} aria-label="never run" />;
  if (pass) return <Icon.CheckCircle size={18} style={{ color: "var(--ok)" }} />;
  return <Icon.XCircle size={18} style={{ color: "var(--crit)" }} />;
}
