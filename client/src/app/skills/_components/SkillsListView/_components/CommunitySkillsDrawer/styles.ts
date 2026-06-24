import type { CSSProperties } from "react";

export const s = {
  body: { padding: "16px 24px 24px", display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  searchRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  filterRow: { display: "flex", flexWrap: "wrap", gap: 6 } satisfies CSSProperties,
  filterChip: (active: boolean): CSSProperties => ({
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
    background: active ? "var(--accent-bg)" : "var(--bg-surface)",
    color: active ? "var(--accent)" : "var(--text-secondary)",
    fontWeight: 600,
    cursor: "pointer",
  }),

  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "12px 14px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  cardHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  cardName: {
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "var(--font-mono, ui-monospace)",
    flex: 1,
  } satisfies CSSProperties,
  cardStars: {
    fontSize: 12,
    color: "var(--text-muted)",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  } satisfies CSSProperties,
  cardDesc: { fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 } satisfies CSSProperties,
  cardMeta: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  repo: {
    fontSize: 11,
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono, ui-monospace)",
    flex: 1,
  } satisfies CSSProperties,
  langChip: {
    fontSize: 11,
    color: "var(--text-secondary)",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    padding: "1px 8px",
    borderRadius: 4,
  } satisfies CSSProperties,

  empty: { padding: 24, color: "var(--text-muted)", textAlign: "center", fontSize: 13 } satisfies CSSProperties,
} as const;

export const FILTER_LANGS = [
  { value: "", labelKey: "communityDrawer.allLanguages" },
  { value: "TypeScript", labelKey: null },
  { value: "any", labelKey: null },
] as const;
