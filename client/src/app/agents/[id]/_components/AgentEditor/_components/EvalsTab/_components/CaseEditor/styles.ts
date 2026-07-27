import type { CSSProperties } from "react";
import type { DiffLineKind } from "./helpers";

export const s = {
  body: { padding: 20 } satisfies CSSProperties,
  error: {
    fontSize: 13,
    color: "var(--crit)",
    background: "var(--crit-bg)",
    border: "1px solid var(--crit)",
    borderRadius: 7,
    padding: "8px 12px",
    marginBottom: 16,
  } satisfies CSSProperties,

  columns: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: 24,
    alignItems: "start",
  } satisfies CSSProperties,
  column: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,

  tabPanel: { marginTop: 12, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  diffPreview: {
    margin: 0,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 12.5,
    lineHeight: 1.6,
    maxHeight: 240,
    overflow: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  } satisfies CSSProperties,
  diffLine: {
    meta: { color: "var(--text-muted)" },
    hunk: { color: "var(--accent)" },
    add: { color: "var(--text-primary)", background: "var(--ok-bg)" },
    text: { color: "var(--text-secondary)" },
  } satisfies Record<DiffLineKind, CSSProperties>,

  rawJson: {
    margin: 0,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 12.5,
    lineHeight: 1.6,
    maxHeight: 300,
    overflow: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  rawJsonEmpty: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,

  expectedHeaderActions: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,

  statusStrip: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    padding: "8px 12px",
    borderRadius: 7,
    fontSize: 12.5,
  } satisfies CSSProperties,
  statusStripPass: {
    color: "var(--ok)",
    background: "var(--ok-bg)",
    border: "1px solid var(--ok)",
  } satisfies CSSProperties,
  statusStripFail: {
    color: "var(--crit)",
    background: "var(--crit-bg)",
    border: "1px solid var(--crit)",
  } satisfies CSSProperties,

  footer: { display: "flex", alignItems: "center", justifyContent: "space-between" } satisfies CSSProperties,
  footerLeft: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  footerRight: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  runOnSaveLabel: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
