import type { CSSProperties } from "react";

export const s = {
  lineRangeRow: { display: "flex", gap: 12 } satisfies CSSProperties,
  lineRangeField: { flex: 1 } satisfies CSSProperties,
  error: {
    fontSize: 13,
    color: "var(--crit)",
    background: "var(--crit-bg)",
    border: "1px solid var(--crit)",
    borderRadius: 7,
    padding: "8px 12px",
    marginBottom: 16,
  } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
} as const;
