/* TrendChart — recall/precision/citation-accuracy across an agent's runs,
   one point per run, tooltip showing the prompt version + cost. Recharts is
   already a dependency (vendor/ui/charts/LineChart.tsx, Donut.tsx) but that
   primitive has no tooltip hook, so this composes Recharts directly rather
   than pulling in a new charting library. */
"use client";

import { useTranslations } from "next-intl";
import {
  CartesianGrid,
  Line,
  LineChart as RLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAgentEvalRuns } from "@/lib/hooks/agent-evals";
import { formatCost } from "@/lib/format-cost";
import { s } from "./styles";

interface TrendRow {
  i: number;
  recall: number;
  precision: number;
  citation_accuracy: number;
  version: number | null;
  cost: number | null;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: TrendRow }[] }) {
  const t = useTranslations("agents.editor.evals.trend");
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]!.payload;
  return (
    <div style={s.tooltip}>
      <div>{t("tooltipVersion", { version: row.version ?? "—" })}</div>
      <div>
        {t("tooltipCost")}: {formatCost(row.cost)}
      </div>
    </div>
  );
}

export function TrendChart({ agentId }: { agentId: string }) {
  const t = useTranslations("agents.editor.evals.trend");
  const { data: runs } = useAgentEvalRuns(agentId);

  if (!runs) return null;

  const sorted = [...runs].sort((a, b) => a.ran_at.localeCompare(b.ran_at));

  if (sorted.length < 2) {
    return (
      <div style={s.wrap} data-testid="trend-chart-placeholder">
        <h3 style={s.heading}>{t("heading")}</h3>
        <div style={s.placeholder}>{t("placeholder")}</div>
      </div>
    );
  }

  const rows: TrendRow[] = sorted.map((r, i) => ({
    i,
    recall: r.recall ?? 0,
    precision: r.precision ?? 0,
    citation_accuracy: r.citation_accuracy ?? 0,
    version: r.agent_version,
    cost: r.cost_usd,
  }));

  return (
    <div style={s.wrap} data-testid="trend-chart">
      <h3 style={s.heading}>{t("heading")}</h3>
      <div style={{ width: "100%", maxWidth: 620, height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RLineChart data={rows} margin={{ top: 14, right: 14, bottom: 8, left: -10 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="i" hide />
            <YAxis
              domain={[0, 1]}
              tick={{ fontSize: 12, fill: "var(--text-muted)" }}
              tickFormatter={(v: number) => v.toFixed(1)}
              axisLine={false}
              tickLine={false}
              width={38}
            />
            <Tooltip content={<ChartTooltip />} />
            <Line type="monotone" dataKey="recall" stroke="var(--accent)" strokeWidth={2} dot isAnimationActive={false} />
            <Line type="monotone" dataKey="precision" stroke="var(--ok)" strokeWidth={2} dot isAnimationActive={false} />
            <Line
              type="monotone"
              dataKey="citation_accuracy"
              stroke="var(--warn)"
              strokeWidth={2}
              dot
              isAnimationActive={false}
            />
          </RLineChart>
        </ResponsiveContainer>
      </div>
      <div style={s.legend}>
        <span>
          <span style={s.legendDot("var(--accent)")} />
          {t("legendRecall")}
        </span>
        <span>
          <span style={s.legendDot("var(--ok)")} />
          {t("legendPrecision")}
        </span>
        <span>
          <span style={s.legendDot("var(--warn)")} />
          {t("legendCitationAccuracy")}
        </span>
      </div>
    </div>
  );
}
