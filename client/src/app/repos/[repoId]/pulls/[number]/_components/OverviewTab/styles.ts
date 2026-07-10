import type { CSSProperties } from "react";

export const s = {
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.05fr)",
    gap: 24,
    alignItems: "stretch",
  } satisfies CSSProperties,

  // The Blast card is absolutely positioned inside this cell, so the cell adds
  // no intrinsic height — the grid row height is driven solely by the Intent
  // panel (whatever it resolves to, including its loading state). The Blast card
  // then fills this cell up to its full height and scrolls (see BlastPanel).
  blastCell: {
    position: "relative",
    minHeight: 0,
  } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,
} as const;
