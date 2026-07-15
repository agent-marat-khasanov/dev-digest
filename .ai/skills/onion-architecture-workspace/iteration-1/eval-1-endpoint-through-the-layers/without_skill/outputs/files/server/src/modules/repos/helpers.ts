import { Severity, type Repo, type RepoStats } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { AppError } from '../../platform/errors.js';
import type { SeverityCount } from './repository.js';
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

const isSeverity = (value: string): value is Severity =>
  (Severity.options as readonly string[]).includes(value);

/**
 * Shape the two raw rollups into the `RepoStats` DTO. `findings.severity` is a
 * free-text column, so a row with an off-contract severity still counts towards
 * `findings_total` but gets no bucket of its own — the three declared buckets
 * are always present (0 when nothing matched).
 */
export function toRepoStatsDto(
  repoId: string,
  since: Date,
  runs: number,
  bySeverity: SeverityCount[],
): RepoStats {
  const buckets = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  let total = 0;
  for (const row of bySeverity) {
    total += row.count;
    if (isSeverity(row.severity)) buckets[row.severity] += row.count;
  }
  return {
    repo_id: repoId,
    since: since.toISOString(),
    runs,
    findings_total: total,
    findings_by_severity: buckets,
  };
}
