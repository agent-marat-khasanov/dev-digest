import type { CSSProperties } from "react";

/** Co-located styles for EvalDashboardView — mirrors SkillsListView/EvalsTab. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 24 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,

  section: { marginBottom: 28 } satisfies CSSProperties,
  sectionHeading: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text-primary)",
    marginBottom: 12,
  } satisfies CSSProperties,

  table: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  headRow: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr 1.2fr",
    gap: 12,
    padding: "0 16px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  row: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr 1.2fr",
    alignItems: "center",
    gap: 12,
    padding: "13px 16px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    textDecoration: "none",
    color: "inherit",
  } satisfies CSSProperties,
  agentName: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  metric: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  passCount: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,

  runsList: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  runRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  runName: { fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,

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
