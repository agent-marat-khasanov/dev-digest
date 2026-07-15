import { z } from 'zod';

/**
 * Repo activity rollup — the wire contract of `GET /repos/:repoId/stats`.
 *
 * A rolling window (30 days) of review activity for ONE repo: how many agent
 * runs it had, how many findings those runs produced, and the split by severity.
 * Computed on read from `agent_runs` + `findings`; nothing is stored.
 *
 * `findings_total` counts every finding in the window — including any whose
 * `severity` is not one of the three canonical `Severity` values (the column is
 * free text) — so the buckets can sum to less than the total.
 */
export const RepoStats = z.object({
  repo_id: z.string(),
  /** Length of the rolling window in days (currently always 30). */
  window_days: z.number().int(),
  /** Inclusive lower bound of the window, ISO-8601. */
  since: z.string(),
  runs: z.number().int(),
  findings_total: z.number().int(),
  findings_by_severity: z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  }),
});
export type RepoStats = z.infer<typeof RepoStats>;
