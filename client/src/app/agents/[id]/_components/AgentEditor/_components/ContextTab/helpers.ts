import type { AgentContextLink, ContextDoc } from "@devdigest/shared";

/** A doc row rendered in the tab — attached rows resolve against the discovered
 *  doc list; `doc` is null when the attached path no longer resolves (AC-18). */
export interface ContextRow {
  path: string;
  doc: ContextDoc | null;
  attached: boolean;
}

/** Last path segment, used as the row's display name. */
export function docName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

/** Substring filter on name + path — does NOT mutate the underlying attached
 *  order/state, only what's rendered (AC-14). */
export function filterRows(rows: ContextRow[], search: string): ContextRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) => docName(r.path).toLowerCase().includes(q) || r.path.toLowerCase().includes(q),
  );
}

/** Ordered attached-path arrays are equal (order matters for assembly). */
export function samePaths(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Ordered attached paths, sorted by the stored `order` field. */
export function linksToPaths(links: AgentContextLink[]): string[] {
  return links
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((l) => l.path);
}

/** Sum of `tokens` for attached docs that resolved (missing docs contribute 0). */
export function totalTokens(attachedPaths: string[], docsByPath: Map<string, ContextDoc>): number {
  let sum = 0;
  for (const path of attachedPaths) sum += docsByPath.get(path)?.tokens ?? 0;
  return sum;
}
