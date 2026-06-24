import type { CSSProperties } from "react";

export const s = {
  wrap: {
    border: "1px solid var(--border)",
    borderRadius: 6,
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 12,
  } satisfies CSSProperties,
  filenameIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  filename: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono, ui-monospace)",
  } satisfies CSSProperties,
  unsavedBadge: {
    fontSize: 11,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    padding: "1px 8px",
    borderRadius: 4,
    fontWeight: 600,
  } satisfies CSSProperties,
  tokens: {
    marginLeft: "auto",
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono, ui-monospace)",
  } satisfies CSSProperties,
  editor: {
    fontSize: 13,
  } satisfies CSSProperties,
} as const;
