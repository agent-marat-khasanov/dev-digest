/* AgentEvalCard — one agent row on the Eval Dashboard (Screen 1): icon tile,
   name + mono model badge, last-run summary, a recall Sparkline, and the
   three headline metrics as big colored percents. The whole card links to
   the agent's dedicated eval dashboard (/eval/:agentId). */
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Icon, Sparkline } from "@devdigest/ui";
import type { EvalDashboardOverview } from "@devdigest/shared";
import { formatRanAt } from "../../helpers";
import { s } from "./styles";

type AgentRow = EvalDashboardOverview["agents"][number];

export function AgentEvalCard({ agent }: { agent: AgentRow }) {
  const t = useTranslations("evalDashboard.list");

  return (
    <Link href={`/eval/${agent.agent_id}`} style={s.card}>
      <div style={s.iconTile}>
        <Icon.Cpu size={16} />
      </div>

      <div style={s.identity}>
        <div style={s.nameRow}>
          <span style={s.name}>{agent.agent_name}</span>
          <Badge mono color="var(--text-secondary)">
            {agent.model}
          </Badge>
        </div>
        <span style={s.lastRun}>
          {agent.last_run
            ? t("lastRun", {
                version: agent.last_run.version ?? "—",
                ranAt: formatRanAt(agent.last_run.ran_at),
                passed: agent.last_run.passed,
                total: agent.last_run.total,
              })
            : t("neverRun")}
        </span>
      </div>

      <Sparkline data={agent.trend} color="var(--accent)" w={64} h={22} />

      <div style={s.metricCol}>
        <span style={s.metricLabel}>{t("recall")}</span>
        <span style={{ ...s.metricValue, color: "var(--accent)" }}>
          {agent.recall != null ? `${Math.round(agent.recall * 100)}%` : "—"}
        </span>
      </div>
      <div style={s.metricCol}>
        <span style={s.metricLabel}>{t("precision")}</span>
        <span style={{ ...s.metricValue, color: "var(--ok)" }}>
          {agent.precision != null ? `${Math.round(agent.precision * 100)}%` : "—"}
        </span>
      </div>
      <div style={s.metricCol}>
        <span style={s.metricLabel}>{t("citation")}</span>
        <span style={{ ...s.metricValue, color: "var(--warn)" }}>
          {agent.citation_accuracy != null ? `${Math.round(agent.citation_accuracy * 100)}%` : "—"}
        </span>
      </div>

      <Icon.ChevronRight size={18} style={s.chevron} />
    </Link>
  );
}
