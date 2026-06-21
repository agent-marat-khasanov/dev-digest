import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: "20px 24px 32px", maxWidth: 880 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  count: {
    fontSize: 12,
    color: "var(--accent)",
    background: "var(--accent-bg)",
    padding: "2px 8px",
    borderRadius: 999,
    fontWeight: 600,
  } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", marginBottom: 18 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  versionPill: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    padding: "2px 10px",
    borderRadius: 999,
    fontFamily: "var(--font-mono, ui-monospace)",
  } satisfies CSSProperties,
  meta: { flex: 1, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  rowTitle: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  rowDate: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  currentBadge: {
    fontSize: 11,
    color: "var(--ok)",
    background: "var(--ok-bg)",
    padding: "2px 8px",
    borderRadius: 999,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 6 } satisfies CSSProperties,

  diffPre: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: 14,
    fontFamily: "var(--font-mono, ui-monospace)",
    fontSize: 12,
    lineHeight: 1.5,
    whiteSpace: "pre",
    overflow: "auto",
    maxHeight: 480,
    margin: 24,
  } satisfies CSSProperties,
  diffEmpty: {
    padding: 24,
    color: "var(--text-muted)",
    fontSize: 13,
    textAlign: "center",
  } satisfies CSSProperties,
} as const;

/** Inline colour for a single diff line based on its leading char. */
export function diffLineColor(line: string): string | undefined {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) {
    return "var(--text-muted)";
  }
  if (line.startsWith("+")) return "var(--ok)";
  if (line.startsWith("-")) return "var(--bad)";
  return undefined;
}
