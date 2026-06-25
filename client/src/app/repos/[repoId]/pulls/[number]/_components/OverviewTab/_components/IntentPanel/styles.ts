import type { CSSProperties } from "react";

export const s = {
  card: {
    marginBottom: 8,
  } satisfies CSSProperties,

  intentQuote: {
    fontSize: 14,
    fontStyle: "italic",
    color: "var(--text-primary)",
    lineHeight: 1.6,
    margin: "0 0 18px",
    paddingLeft: 12,
    borderLeft: "3px solid var(--accent)",
  } satisfies CSSProperties,

  scopeRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginBottom: 18,
  } satisfies CSSProperties,

  scopeHeading: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,

  scopeList: {
    margin: 0,
    paddingLeft: 16,
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
  } satisfies CSSProperties,

  scopeItem: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,

  riskRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
    marginTop: 4,
  } satisfies CSSProperties,

  skeletonStack: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  } satisfies CSSProperties,
} as const;
