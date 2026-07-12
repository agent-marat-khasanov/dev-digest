import { resolve, sep } from 'node:path';

/**
 * Resolve a repo-relative path against a clone root, rejecting traversal
 * (absolute paths, `..`) — `resolve(root, rel)` must stay under
 * `resolve(root)` (== root or start with `root + sep`). Mirrors
 * `conventions/service.ts`'s guarded read; NOT `readClone` (no guard there).
 *
 * Pure filesystem-path guard shared by the `context` module (discovery/preview)
 * and `reviews/run-executor.ts` (run-time doc injection) so it is defined
 * exactly once, outside either module.
 */
export function resolveInClone(clonePath: string, rel: string): string | null {
  const root = resolve(clonePath);
  const full = resolve(root, rel);
  if (full !== root && !full.startsWith(root + sep)) return null;
  return full;
}
