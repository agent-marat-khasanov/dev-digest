import type { CSSProperties } from "react";

/** Co-located styles for ContextView — mirrors ConventionsView. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 18 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  accent: { color: "var(--accent)" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  body: { display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr)", gap: 20 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  loadingList: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  previewCard: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: 20,
    minHeight: 240,
  } satisfies CSSProperties,
  previewHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  previewPath: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  previewPlaceholder: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: 200,
    color: "var(--text-muted)",
    fontSize: 14,
  } satisfies CSSProperties,
} as const;
