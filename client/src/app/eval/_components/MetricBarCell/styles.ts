import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  track: {
    width: 56,
    height: 6,
    borderRadius: 3,
    background: "var(--bg-hover)",
    overflow: "hidden",
    flexShrink: 0,
  } satisfies CSSProperties,
  fill: { height: "100%", borderRadius: 3 } satisfies CSSProperties,
  pct: { fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
} as const;
