import type { CSSProperties } from "react";

export const s = {
  card: {
    marginBottom: 20,
    padding: 20,
  } satisfies CSSProperties,

  skeletonStack: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  } satisfies CSSProperties,

  riskRow: {
    marginBottom: 16,
  } satisfies CSSProperties,

  narrative: {
    fontSize: 13.5,
    color: "var(--text-secondary)",
    lineHeight: 1.6,
    marginBottom: 18,
  } satisfies CSSProperties,

  sectionHeading: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
    marginBottom: 10,
  } satisfies CSSProperties,

  risksList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 12,
    marginBottom: 18,
  } satisfies CSSProperties,

  riskCard: {
    padding: 12,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,

  riskHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  } satisfies CSSProperties,

  riskTitle: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  riskExplanation: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.55,
  } satisfies CSSProperties,

  refRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
    marginTop: 8,
  } satisfies CSSProperties,

  focusList: {
    margin: 0,
    paddingLeft: 20,
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  } satisfies CSSProperties,

  focusItem: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,

  focusReason: {
    display: "block",
    marginTop: 2,
  } satisfies CSSProperties,

  footer: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  fileLinkButton: {
    all: "unset",
    cursor: "pointer",
    fontFamily: "var(--mono, monospace)",
  } satisfies CSSProperties,

  wrapBadge: {
    whiteSpace: "normal" as const,
    overflowWrap: "anywhere" as const,
    maxWidth: "100%",
  } satisfies CSSProperties,
} as const;
