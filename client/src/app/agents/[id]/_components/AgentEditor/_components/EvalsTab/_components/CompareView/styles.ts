import type { CSSProperties } from "react";

export const s = {
  wrap: { marginTop: 28 } satisfies CSSProperties,
  heading: { fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", marginBottom: 12 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  rowMain: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 } satisfies CSSProperties,
  rowName: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  rowSub: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  panel: {
    marginTop: 8,
    padding: 16,
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  deltaRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "4px 0",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  diffLine: (kind: "add" | "del" | "ctx"): CSSProperties => ({
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 12.5,
    whiteSpace: "pre-wrap",
    padding: "1px 8px",
    background:
      kind === "add" ? "var(--ok-bg, rgba(16,185,129,.12))" : kind === "del" ? "var(--crit-bg)" : "transparent",
    color: kind === "add" ? "var(--ok)" : kind === "del" ? "var(--crit)" : "var(--text-secondary)",
  }),
} as const;
