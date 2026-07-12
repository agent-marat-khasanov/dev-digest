import { z } from 'zod';
import { INJECTION_GUARD, wrapUntrusted } from '@devdigest/reviewer-core';
import type { TourFacts } from './facts.js';

/**
 * Model output schema (DISTINCT from the transport `TourSection` contract).
 * Wrapped as `z.object` because `completeStructured` forces tool-use and tool
 * inputs must be objects. `critical_paths`/`reading_path` carry structured
 * `items` (never inline paths in `body`, AC-7) and `run_locally` carries NO
 * `commands` field — the model never authors run commands (AC-8).
 */
export const OnboardingModelOutput = z.object({
  architecture: z.object({
    body: z.string(),
    diagram: z.string().nullable(),
  }),
  critical_paths: z.object({
    body: z.string(),
    items: z.array(z.object({ path: z.string(), role: z.string() })),
  }),
  reading_path: z.object({
    body: z.string(),
    items: z.array(z.object({ path: z.string(), why: z.string() })),
  }),
  first_tasks: z.object({
    body: z.string(),
  }),
  run_locally: z.object({
    body: z.string(),
  }),
});
export type OnboardingModelOutput = z.infer<typeof OnboardingModelOutput>;

/**
 * Assembles the user turn from gathered facts — every repo-derived block is
 * untrusted data, wrapped per block (AC-20). `INJECTION_GUARD` is appended so
 * the reminder travels with the untrusted payload regardless of how the
 * caller renders the system prompt.
 */
export function buildUserMessage(facts: TourFacts): string {
  const sections: string[] = [];

  sections.push(wrapUntrusted('repo_map', facts.repoMap));

  if (facts.topFiles.length > 0) {
    const text = facts.topFiles.map((path, i) => `${i + 1}. ${path}`).join('\n');
    sections.push(wrapUntrusted('reading_path_candidates', text));
  }

  if (facts.criticalPaths.length > 0) {
    const text = facts.criticalPaths
      .map((chain, i) => `${i + 1}. ${chain.join(' -> ')}`)
      .join('\n');
    sections.push(wrapUntrusted('critical_paths_candidates', text));
  }

  const reachableEntries = Object.entries(facts.reachableFacts).filter(
    ([, f]) => f.endpoints.length > 0 || f.crons.length > 0,
  );
  if (reachableEntries.length > 0) {
    const text = reachableEntries
      .map(([file, f]) => `${file}: endpoints=[${f.endpoints.join(', ')}] crons=[${f.crons.join(', ')}]`)
      .join('\n');
    sections.push(wrapUntrusted('reachable_routes', text));
  }

  sections.push(INJECTION_GUARD);

  return sections.join('\n\n');
}
