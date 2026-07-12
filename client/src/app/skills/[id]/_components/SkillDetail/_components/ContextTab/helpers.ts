import type { ContextDoc } from "@devdigest/shared";

/** A doc row shown in the ContextTab list: `doc` is null when an attached
 *  path no longer resolves to a discovered document (AC-18, "missing"). */
export interface ContextRow {
  path: string;
  doc: ContextDoc | null;
}

/** Build the initial row order: attached paths first (in their stored
 *  order — including any that no longer resolve, so they still render as
 *  "missing"), then the remaining discovered docs in discovery order. */
export function buildInitialOrder(
  discovered: ContextDoc[],
  attachedLinks: Array<{ path: string; order: number }>,
): string[] {
  const sortedAttached = [...attachedLinks].sort((a, b) => a.order - b.order).map((l) => l.path);
  const attachedSet = new Set(sortedAttached);
  const unattached = discovered.map((d) => d.path).filter((p) => !attachedSet.has(p));
  return [...sortedAttached, ...unattached];
}

/** Substring filter on doc path (covers name — the path suffix). */
export function filterRows(rows: ContextRow[], search: string): ContextRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.path.toLowerCase().includes(q));
}

/** Deep-equal attached links (path + order, order-independent — both are
 *  sorted before compare). Cheap — never more than a few dozen docs. */
export function sameAttachedOrder(
  a: Array<{ path: string; order: number }>,
  b: Array<{ path: string; order: number }>,
): boolean {
  if (a.length !== b.length) return false;
  const as = [...a].sort((x, y) => x.order - y.order);
  const bs = [...b].sort((x, y) => x.order - y.order);
  for (let i = 0; i < as.length; i++) {
    if (as[i]!.path !== bs[i]!.path) return false;
  }
  return true;
}
