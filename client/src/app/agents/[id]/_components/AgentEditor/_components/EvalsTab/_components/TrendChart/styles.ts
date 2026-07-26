import type { CSSProperties } from "react";

export const s = {
  wrap: { marginTop: 28 } satisfies CSSProperties,
  heading: { fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 } satisfies CSSProperties,
  placeholder: {
    padding: "24px 20px",
    borderRadius: 8,
    border: "1px dashed var(--border-strong)",
    color: "var(--text-muted)",
    fontSize: 13,
    textAlign: "center",
  } satisfies CSSProperties,
  tooltip: {
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    fontSize: 12,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  legend: { display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  legendDot: (color: string): CSSProperties => ({
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: 99,
    background: color,
    marginRight: 6,
  }),
} as const;
