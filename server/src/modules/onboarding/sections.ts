import type { OnboardingLink, TourSection, TourSectionId } from '@devdigest/shared';
import type { TourFacts } from './facts.js';

/**
 * Fixed, ordered, mandatory five (AC-6) — id + title, no `routes_and_apis`
 * (NG6, folded into `architecture`). Order here IS the section order.
 */
export const TOUR_SECTIONS: ReadonlyArray<{ id: TourSectionId; title: string }> = [
  { id: 'architecture', title: 'Architecture' },
  { id: 'critical_paths', title: 'Critical Paths' },
  { id: 'run_locally', title: 'How to Run Locally' },
  { id: 'reading_path', title: 'Guided Reading Path' },
  { id: 'first_tasks', title: 'First Tasks' },
];

/**
 * Drops any item whose `path` is not present in `allowedPaths` (AC-7). Strict
 * allowlist — an unknown path is dropped, never rendered clickable.
 */
export function validatePaths<T extends { path: string }>(
  items: T[],
  allowedPaths: ReadonlySet<string>,
): T[] {
  return items.filter((item) => allowedPaths.has(item.path));
}

/**
 * Deterministic, facts-only fallback tour (AC-9) — no model call. The
 * reading list carries the file + its rank position only, deliberately NOT
 * a "why read this" (that is model narrative, absent here).
 */
export function buildSkeleton(facts: TourFacts, reason: string): TourSection[] {
  const readingLinks: OnboardingLink[] = facts.topFiles.map((path, i) => ({
    label: `#${i + 1} by rank`,
    path,
  }));

  const criticalPathFiles = [...new Set(facts.criticalPaths.flat())];
  const criticalLinks: OnboardingLink[] = facts.criticalPaths.flatMap((chain, chainIndex) =>
    chain.map((path, depth) => ({
      label: `Critical path #${chainIndex + 1}, step ${depth + 1}`,
      path,
    })),
  );

  const routeCount = Object.values(facts.reachableFacts).reduce(
    (sum, f) => sum + f.endpoints.length + f.crons.length,
    0,
  );

  return TOUR_SECTIONS.map(({ id, title }): TourSection => {
    switch (id) {
      case 'architecture':
        return {
          id,
          title,
          body: [
            `Generated without a model (${reason}) — deterministic facts only.`,
            `${facts.filesIndexed} files indexed.`,
            routeCount > 0
              ? `${routeCount} reachable route(s)/cron(s) found near the top-ranked files.`
              : 'No reachable routes/crons found.',
          ].join('\n\n'),
          diagram: null,
          links: null,
          commands: null,
        };
      case 'critical_paths':
        return {
          id,
          title,
          body:
            criticalPathFiles.length > 0
              ? `${facts.criticalPaths.length} dependency chain(s) from the highest-ranked files.`
              : 'No dependency chains available.',
          diagram: null,
          links: criticalLinks.length > 0 ? criticalLinks : null,
          commands: null,
        };
      case 'run_locally':
        return {
          id,
          title,
          body:
            facts.commands.length > 0
              ? 'Commands derived from the repo manifest.'
              : 'No run commands could be derived from the repo manifest.',
          diagram: null,
          links: null,
          commands: facts.commands.length > 0 ? facts.commands : null,
        };
      case 'reading_path':
        return {
          id,
          title,
          body:
            readingLinks.length > 0
              ? 'Files ordered by import-graph rank (highest first).'
              : 'No ranked files available.',
          diagram: null,
          links: readingLinks.length > 0 ? readingLinks : null,
          commands: null,
        };
      case 'first_tasks':
        return {
          id,
          title,
          body: 'Generated without a model — no narrative first-task suggestions are available. Start with the reading path above.',
          diagram: null,
          links: null,
          commands: null,
        };
    }
  });
}
