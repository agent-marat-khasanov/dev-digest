import type { CSSProperties } from "react";

/** Co-located styles for EvalDashboardView (Screen 1 — agent cards + recent runs table). */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1180, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 24 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,

  section: { marginBottom: 28 } satisfies CSSProperties,

  cardList: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,

  runsTable: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  runsHeadRow: {
    display: "grid",
    gridTemplateColumns: "1.6fr 1.3fr 0.7fr 1fr 1fr 1fr 0.7fr",
    gap: 12,
    padding: "0 16px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  runsRow: {
    display: "grid",
    gridTemplateColumns: "1.6fr 1.3fr 0.7fr 1fr 1fr 1fr 0.7fr",
    alignItems: "center",
    gap: 12,
    padding: "13px 16px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  runAgentName: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  runRanAt: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  versionLink: { fontSize: 13, fontWeight: 600, color: "var(--accent)", textDecoration: "none" } satisfies CSSProperties,
  runPass: { fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,

  noRecentRuns: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,

  confirmBar: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    marginBottom: 24,
  } satisfies CSSProperties,
  confirmBody: { flex: 1, fontSize: 13.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  confirmActions: { display: "flex", gap: 8 } satisfies CSSProperties,
} as const;
