import { z } from 'zod';

/**
 * 30-day review-activity rollup behind GET /repos/:id/stats — how many review
 * runs the repo had, how many findings those runs produced, and the split by
 * severity. `since` echoes the (inclusive) start of the window so the client
 * never has to re-derive it.
 *
 * `findings_by_severity` mirrors AgentStats' fixed three-key shape: every
 * severity is always present (0 when nothing was found).
 */
export const RepoStats = z.object({
  repo_id: z.string(),
  since: z.string(),
  runs: z.number().int().nonnegative(),
  findings_total: z.number().int().nonnegative(),
  findings_by_severity: z.object({
    CRITICAL: z.number().int().nonnegative(),
    WARNING: z.number().int().nonnegative(),
    SUGGESTION: z.number().int().nonnegative(),
  }),
});
export type RepoStats = z.infer<typeof RepoStats>;
