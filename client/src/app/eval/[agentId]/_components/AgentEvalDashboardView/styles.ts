import type { CSSProperties } from "react";

/** Co-located styles for AgentEvalDashboardView (Screen 2). */
export const s = {
  page: { padding: "24px 32px 60px", maxWidth: 1180, margin: "0 auto" } satisfies CSSProperties,
  backLink: {
    display: "inline-block",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
    textDecoration: "none",
    marginBottom: 14,
  } satisfies CSSProperties,

  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 20,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 260 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 6 } satisfies CSSProperties,
  controls: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  agentSelect: { minWidth: 200 } satisfies CSSProperties,
  rangeSelect: { minWidth: 140 } satisfies CSSProperties,

  confirmBar: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    marginBottom: 20,
  } satisfies CSSProperties,
  confirmBody: { flex: 1, fontSize: 13.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  confirmActions: { display: "flex", gap: 8 } satisfies CSSProperties,

  alertBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    color: "var(--text-primary)",
    fontSize: 13.5,
    lineHeight: 1.5,
    marginBottom: 20,
  } satisfies CSSProperties,

  metricsRow: { display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap" } satisfies CSSProperties,

  trendPanel: {
    padding: 18,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 24,
  } satisfies CSSProperties,
  legend: { display: "flex", alignItems: "center", gap: 14, fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  legendDash: (color: string): CSSProperties => ({
    width: 12,
    height: 2,
    borderRadius: 2,
    background: color,
    display: "inline-block",
  }),
} as const;
