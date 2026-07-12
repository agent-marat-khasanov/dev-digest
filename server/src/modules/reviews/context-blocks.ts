/**
 * Pure ordering/dedupe step for run-time project-context injection (T6,
 * AC-19). The agent's own attached docs come first in their stored order,
 * followed by docs inherited from the agent's enabled skills; the combined
 * list is deduped by path, keeping the FIRST occurrence — so an agent-level
 * attachment always wins its position over the same doc inherited from a
 * skill.
 *
 * Kept in its own file (no repository / container imports) so it loads
 * cleanly in unit tests, mirroring `skill-blocks.ts`.
 */
export function orderContextPaths(agentPaths: string[], skillInheritedPaths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const path of [...agentPaths, ...skillInheritedPaths]) {
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}
