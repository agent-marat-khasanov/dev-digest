import type { CSSProperties } from "react";

/** Co-located styles for ConventionsView — mirrors SkillsListView. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 18 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  accent: { color: "var(--accent)" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  actionBar: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginBottom: 18,
    paddingBottom: 14,
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  actionLeft: { display: "flex", alignItems: "center", gap: 12, flex: 1 } satisfies CSSProperties,
  counter: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  toggleRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
} as const;
