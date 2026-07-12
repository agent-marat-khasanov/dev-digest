import type { ContextDoc } from "@devdigest/shared";

/** File name = last path segment, e.g. "specs/api/security-baseline.md" → "security-baseline.md". */
export function docFileName(path: string): string {
  const segments = path.split("/");
  return segments[segments.length - 1] ?? path;
}

/** Doc list sorted by repo-relative path — stable, predictable row order. */
export function sortDocs(docs: ContextDoc[]): ContextDoc[] {
  return [...docs].sort((a, b) => a.path.localeCompare(b.path));
}
