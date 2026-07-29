import type { CSSProperties } from "react";

export const s = {
  wrap: {
    padding: 18,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  headerRow: { display: "flex", alignItems: "center", gap: 14, marginBottom: 14 } satisfies CSSProperties,
  heading: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    flex: 1,
  } satisfies CSSProperties,
  selectedCount: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,

  table: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  headRow: {
    display: "grid",
    gridTemplateColumns: "28px 1.3fr 0.7fr 1fr 1fr 1fr 0.7fr 0.8fr",
    gap: 12,
    padding: "0 12px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  row: {
    display: "grid",
    gridTemplateColumns: "28px 1.3fr 0.7fr 1fr 1fr 1fr 0.7fr 0.8fr",
    alignItems: "center",
    gap: 12,
    padding: "11px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  ranAt: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  version: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  pass: { fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  cost: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
