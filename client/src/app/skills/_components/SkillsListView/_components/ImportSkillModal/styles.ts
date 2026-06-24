import type { CSSProperties } from "react";

/** Co-located styles for ImportSkillModal. */
export const s = {
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,

  trustBanner: {
    padding: "10px 12px",
    borderRadius: 6,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    color: "var(--warn)",
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,

  pickerRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    border: "1px dashed var(--border)",
    borderRadius: 6,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  hiddenInput: { display: "none" } satisfies CSSProperties,
  filename: {
    flex: 1,
    fontSize: 13,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  filenameMuted: { flex: 1, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,

  errorBox: {
    padding: 10,
    borderRadius: 6,
    border: "1px solid var(--bad)",
    background: "var(--bad-bg)",
    color: "var(--bad)",
    fontSize: 13,
  } satisfies CSSProperties,

  previewWrap: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  previewTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  } satisfies CSSProperties,
  previewHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  previewName: { fontSize: 15, fontWeight: 600, flex: 1 } satisfies CSSProperties,
  previewTypeChip: (color: string): CSSProperties => ({
    fontSize: 12,
    fontWeight: 600,
    color,
    background: color + "1a",
    padding: "1px 8px",
    borderRadius: 4,
  }),
  previewDescription: {
    fontSize: 13,
    color: "var(--text-muted)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  previewBody: {
    border: "1px solid var(--border)",
    borderRadius: 6,
    background: "var(--bg-surface)",
    padding: 12,
    maxHeight: 280,
    overflow: "auto",
    fontSize: 12,
    fontFamily: "var(--font-mono, ui-monospace)",
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,

  refLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginRight: 8,
  } satisfies CSSProperties,
  refList: { display: "flex", flexWrap: "wrap", gap: 6 } satisfies CSSProperties,
  refChip: {
    fontSize: 12,
    color: "var(--text-secondary)",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    padding: "2px 8px",
    borderRadius: 999,
  } satisfies CSSProperties,

  warnings: {
    padding: 10,
    borderRadius: 6,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    color: "var(--warn)",
    fontSize: 12,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  warningsTitle: { fontWeight: 600, marginBottom: 4 } satisfies CSSProperties,
} as const;
