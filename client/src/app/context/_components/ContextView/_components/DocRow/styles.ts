import type { CSSProperties } from "react";

export const s = {
  row: (selected: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
    background: selected ? "var(--bg-hover)" : "var(--bg-elevated)",
    textAlign: "left",
    cursor: "pointer",
  }),
  text: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  name: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  path: {
    fontSize: 12,
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
