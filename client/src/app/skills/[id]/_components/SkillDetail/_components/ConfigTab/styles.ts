import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 920, padding: "20px 24px 32px" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 20 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  versionPill: {
    marginLeft: 10,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    padding: "1px 8px",
    borderRadius: 999,
    fontFamily: "var(--font-mono, ui-monospace)",
  } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, marginTop: 16 } satisfies CSSProperties,
  savedNote: { alignSelf: "center", fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,
} as const;
