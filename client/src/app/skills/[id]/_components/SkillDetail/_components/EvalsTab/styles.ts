import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: "20px 24px 32px", maxWidth: 920 } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  } satisfies CSSProperties,
  heading: { fontSize: 16, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  headerActions: { marginLeft: "auto", display: "flex", gap: 8 } satisfies CSSProperties,

  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "13px 16px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  rowMain: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    minWidth: 0,
    flex: 1,
  } satisfies CSSProperties,
  name: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  sub: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,

  actions: { display: "flex", alignItems: "center", gap: 2 } satisfies CSSProperties,
  iconBtn: (disabled: boolean): CSSProperties => ({
    background: "none",
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    color: "var(--text-muted)",
    display: "inline-flex",
    padding: 6,
    borderRadius: 6,
  }),
  neverRunDot: {
    width: 16,
    height: 16,
    borderRadius: 99,
    border: "2px solid var(--text-muted)",
    opacity: 0.5,
    flexShrink: 0,
  } satisfies CSSProperties,

  empty: {
    padding: "60px 32px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  emptyIcon: { color: "var(--text-muted)", marginBottom: 14 } satisfies CSSProperties,
  emptyTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  emptyBody: { fontSize: 13.5, marginTop: 8, maxWidth: 460 } satisfies CSSProperties,
} as const;
