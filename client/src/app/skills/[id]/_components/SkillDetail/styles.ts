import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
  } satisfies CSSProperties,
  tabsBar: {
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  } satisfies CSSProperties,
  body: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
  } satisfies CSSProperties,
} as const;
