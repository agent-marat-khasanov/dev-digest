import type { CSSProperties } from "react";

export const s = {
  body: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  banner: {
    padding: "10px 12px",
    borderRadius: 7,
    fontSize: 13,
    color: "var(--accent)",
    background: "var(--accent-bg)",
    border: "1px solid var(--accent)",
    lineHeight: 1.45,
  } satisfies CSSProperties,
  toggleRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  toggleHint: { fontSize: 12, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
  bodyHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  bodyFile: { color: "var(--text-secondary)" } satisfies CSSProperties,
  unsaved: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    padding: "1px 7px",
    borderRadius: 4,
  } satisfies CSSProperties,
  tokens: { marginLeft: "auto" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flex: 1 } satisfies CSSProperties,
  footerNote: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  footerActions: { display: "flex", gap: 10 } satisfies CSSProperties,
} as const;
