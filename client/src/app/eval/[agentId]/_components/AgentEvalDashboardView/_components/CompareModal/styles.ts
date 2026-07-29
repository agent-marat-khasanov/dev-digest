import type { CSSProperties } from "react";

export const s = {
  body: { padding: 20, display: "flex", flexDirection: "column", gap: 22 } satisfies CSSProperties,

  transitions: { display: "flex", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  transitionCard: {
    flex: "1 1 140px",
    padding: 14,
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  transitionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,
  transitionValues: {
    display: "flex",
    alignItems: "baseline",
    gap: 6,
    fontSize: 15,
    marginBottom: 4,
  } satisfies CSSProperties,
  transitionOld: { color: "var(--text-muted)" } satisfies CSSProperties,
  transitionArrow: { color: "var(--text-muted)" } satisfies CSSProperties,
  transitionNew: { fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  transitionDelta: (up: boolean, flat: boolean): CSSProperties => ({
    fontSize: 12.5,
    fontWeight: 600,
    color: flat ? "var(--text-muted)" : up ? "var(--ok)" : "var(--crit)",
  }),

  diffSection: {} satisfies CSSProperties,
  diffHeading: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 10,
  } satisfies CSSProperties,
  legend: { display: "flex", gap: 10, marginBottom: 10 } satisfies CSSProperties,
  legendChip: (color: string): CSSProperties => ({
    fontSize: 12,
    fontWeight: 600,
    color,
    background: color + "1a",
    padding: "2px 8px",
    borderRadius: 5,
  }),
  diffBox: {
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    padding: "10px 0",
    maxHeight: 320,
    overflow: "auto",
  } satisfies CSSProperties,
  diffLine: (kind: "add" | "del" | "ctx"): CSSProperties => ({
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 12.5,
    lineHeight: 1.6,
    padding: "0 14px",
    whiteSpace: "pre-wrap",
    color: kind === "ctx" ? "var(--text-secondary)" : "var(--text-primary)",
    background: kind === "add" ? "var(--ok-bg)" : kind === "del" ? "var(--crit-bg)" : "transparent",
  }),
  versionUnavailable: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,

  footer: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
