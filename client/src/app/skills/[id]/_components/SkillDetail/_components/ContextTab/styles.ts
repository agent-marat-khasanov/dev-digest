import type { CSSProperties } from "react";

/** Co-located styles for ContextTab + its rows + preview modal. */
export const s = {
  wrap: { maxWidth: 920 } satisfies CSSProperties,

  header: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginBottom: 8,
  } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  countBadge: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--accent)",
    background: "var(--accent-bg)",
    padding: "2px 8px",
    borderRadius: 999,
  } satisfies CSSProperties,
  filter: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    width: 200,
  } satisfies CSSProperties,
  filterIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  filterInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  helper: {
    fontSize: 13,
    color: "var(--text-muted)",
    marginBottom: 14,
  } satisfies CSSProperties,

  list: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  empty: {
    padding: "24px 16px",
    border: "1px dashed var(--border)",
    borderRadius: 8,
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: 13,
  } satisfies CSSProperties,

  row: (dragging: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 6,
    border: "1px solid " + (dragging ? "var(--accent)" : "var(--border)"),
    background: dragging ? "var(--bg-hover)" : "var(--bg-elevated)",
    boxShadow: dragging ? "0 4px 12px rgba(0,0,0,0.15)" : "none",
  }),
  dragHandle: {
    cursor: "grab",
    color: "var(--text-muted)",
    display: "inline-flex",
    padding: 4,
    touchAction: "none",
  } satisfies CSSProperties,
  rowNameWrap: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 1,
  } satisfies CSSProperties,
  rowName: {
    fontSize: 14,
    fontWeight: 500,
    fontFamily: "var(--font-mono, ui-monospace)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  rowPath: {
    fontSize: 11,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  rowDisabledName: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  typeChip: (color: string): CSSProperties => ({
    fontSize: 11,
    fontWeight: 600,
    color,
    background: color + "1a",
    padding: "1px 8px",
    borderRadius: 4,
    flexShrink: 0,
  }),
  missingChip: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--crit)",
    background: "var(--crit-bg)",
    padding: "1px 8px",
    borderRadius: 4,
    flexShrink: 0,
  } satisfies CSSProperties,
  tokenChip: {
    fontSize: 11,
    color: "var(--text-muted)",
    flexShrink: 0,
    minWidth: 64,
    textAlign: "right",
  } satisfies CSSProperties,
  previewBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--text-muted)",
    display: "inline-flex",
    padding: 4,
  } satisfies CSSProperties,

  tokenTotal: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginTop: 10,
  } satisfies CSSProperties,

  actionsRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
  } satisfies CSSProperties,
  savedNote: { fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,

  previewBody: { padding: 20 } satisfies CSSProperties,
} as const;
