import { Severity, type Repo, type RepoStats } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { AppError } from '../../platform/errors.js';
import {
  GITHUB_URL_REGEX,
  GIT_TOKEN_USERNAME,
  GITHUB_HTTPS_HOST,
} from './constants.js';

/**
 * F1 — repos pure helpers (extracted from routes.ts; no behaviour change).
 * Pure functions only — no I/O, no DB, no container.
 */

/** Parse `owner`/`name` from a GitHub URL (https or ssh form). */
export function parseRepoUrl(url: string): { owner: string; name: string } {
  // https://github.com/owner/repo(.git)  |  git@github.com:owner/repo.git
  const match = url.match(GITHUB_URL_REGEX);
  if (!match?.[1] || !match[2]) {
    throw new AppError('invalid_repo_url', `Could not parse owner/repo from '${url}'`, 400);
  }
  return { owner: match[1], name: match[2] };
}

/**
 * Embed a token into an https github.com URL so private clones authenticate
 * non-interactively. SSH/non-GitHub URLs are left untouched.
 */
export function withGitHubToken(url: string, token: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && u.hostname === GITHUB_HTTPS_HOST) {
      u.username = GIT_TOKEN_USERNAME;
      u.password = token;
      return u.toString();
    }
  } catch {
    /* non-URL (e.g. git@github.com:...) — leave as-is */
  }
  return url;
}

/** Map a persisted repo row to the API `Repo` DTO. */
export function toRepoDto(row: typeof t.repos.$inferSelect): Repo {
  return {
    id: row.id,
    workspace_id: row.workspaceId,
    owner: row.owner,
    name: row.name,
    full_name: row.fullName,
    default_branch: row.defaultBranch,
    clone_path: row.clonePath,
    last_polled_at: row.lastPolledAt?.toISOString() ?? null,
    created_by: row.createdBy,
  };
}

/**
 * The raw rollup the review data layer produces for a window. Declared
 * structurally so this module never imports the reviews module's internals —
 * the container hands the numbers over, this maps them to the wire shape.
 */
export interface RepoStatsRollup {
  runs: number;
  findingsBySeverity: { severity: string; count: number }[];
}

/**
 * Map the raw rollup to the `RepoStats` DTO. `findings.severity` is a free-text
 * column, so unknown severities are still counted in `findings_total` but are not
 * invented into a bucket — the three canonical buckets are always present (0 when
 * absent) so the UI never has to null-check them.
 */
export function toRepoStatsDto(
  repoId: string,
  windowDays: number,
  since: Date,
  rollup: RepoStatsRollup,
): RepoStats {
  const buckets: RepoStats['findings_by_severity'] = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  let total = 0;
  for (const row of rollup.findingsBySeverity) {
    total += row.count;
    const severity = Severity.safeParse(row.severity);
    if (severity.success) buckets[severity.data] += row.count;
  }
  return {
    repo_id: repoId,
    window_days: windowDays,
    since: since.toISOString(),
    runs: rollup.runs,
    findings_total: total,
    findings_by_severity: buckets,
  };
}
