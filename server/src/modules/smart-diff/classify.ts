import type { SmartDiffRole } from '@devdigest/shared';
import { LOCK_FILE_NAMES, BOILERPLATE_PATTERNS, WIRING_PATTERNS } from './constants.js';

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

/**
 * Deterministically classify a file path as `core`, `wiring`, or `boilerplate`.
 *
 * Checked in priority order: boilerplate → wiring → core.
 * This ensures lock files (e.g. `package-lock.json`) never match the
 * `*.json` wiring rule.
 *
 * Pure function: no I/O, no Fastify, no Drizzle.
 */
export function classifyFile(path: string): SmartDiffRole {
  const base = basename(path);
  const segments = path.split('/');

  // --- Boilerplate (highest priority) ---

  // 1. Exact lock-file basename match
  if ((LOCK_FILE_NAMES as readonly string[]).includes(base)) return 'boilerplate';

  // 2. Path contains a boilerplate directory segment (dist, build, .next, etc.)
  if (BOILERPLATE_PATTERNS.dirSegments.some((seg) => segments.includes(seg))) {
    return 'boilerplate';
  }

  // 3. Basename ends with a boilerplate suffix (.min.js, .snap, .map, etc.)
  if (BOILERPLATE_PATTERNS.suffixes.some((suf) => base.endsWith(suf))) {
    return 'boilerplate';
  }

  // 4. Basename contains a boilerplate substring (.generated.)
  if (BOILERPLATE_PATTERNS.containsSubstring.some((sub) => base.includes(sub))) {
    return 'boilerplate';
  }

  // --- Wiring ---

  // 5. Exact basename match (index.ts, index.tsx, server.ts, app.ts, package.json)
  if ((WIRING_PATTERNS.basenames as readonly string[]).includes(base)) return 'wiring';

  // 6. Prefix [+ suffix] combos: tsconfig*.json, Dockerfile*
  for (const ps of WIRING_PATTERNS.prefixSuffix) {
    const matchesPrefix = base.startsWith(ps.prefix);
    const matchesSuffix = 'suffix' in ps ? base.endsWith(ps.suffix) : true;
    if (matchesPrefix && matchesSuffix) return 'wiring';
  }

  // 7. Basename contains wiring substring (.config.)
  if (WIRING_PATTERNS.containsSubstring.some((sub) => base.includes(sub))) return 'wiring';

  // 8. Basename ends with .yml or .yaml
  if (WIRING_PATTERNS.suffixes.some((suf) => base.endsWith(suf))) return 'wiring';

  // 9. GitHub Actions workflow path
  if (WIRING_PATTERNS.pathSubstring.some((sub) => path.includes(sub))) return 'wiring';

  // --- Core (default) ---
  return 'core';
}
