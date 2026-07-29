import type { CSSProperties } from "react";

export const s = {
  body: { padding: 20, display: "flex", flexDirection: "column", gap: 18 } satisfies CSSProperties,

  metaRow: { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" } satisfies CSSProperties,
  metaLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  banner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  section: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  sectionHeading: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  diffBox: {
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    padding: "10px 0",
    maxHeight: 260,
    overflow: "auto",
  } satisfies CSSProperties,
  diffLine: (kind: "add" | "del" | "ctx" | "hunk"): CSSProperties => ({
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 12.5,
    lineHeight: 1.6,
    padding: "0 14px",
    whiteSpace: "pre-wrap",
    color:
      kind === "hunk"
        ? "var(--text-muted)"
        : kind === "ctx"
          ? "var(--text-secondary)"
          : "var(--text-primary)",
    background: kind === "add" ? "var(--ok-bg)" : kind === "del" ? "var(--crit-bg)" : "transparent",
  }),

  expectedList: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  expectedRow: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  expectedTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  expectedMeta: { display: "flex", gap: 8, alignItems: "center" } satisfies CSSProperties,
  expectedLoc: { fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)" } satisfies CSSProperties,

  empty: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  errorText: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,

  footer: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
