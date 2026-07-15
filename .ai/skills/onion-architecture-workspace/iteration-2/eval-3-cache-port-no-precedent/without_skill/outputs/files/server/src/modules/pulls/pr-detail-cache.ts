import { PrDetail, type GitHubClient, type RepoRef } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';

/**
 * Read-through cache for the GitHub PR detail read.
 *
 * `getPullRequest` is the expensive one: pulls.get + listFiles (the WHOLE file
 * list) + listCommits + the linked issue = up to 4 REST calls, and it runs on
 * every open of a PR — including every re-run of a review on an unchanged PR.
 * That is what burns the 5k/h REST quota, so it is what we put Redis in front of.
 *
 * Key = repo + PR number + head sha. Invalidation is therefore structural: a new
 * push moves head_sha (the PR-list sync writes it to pull_requests.head_sha) →
 * new key → the old entry is never read again and expires on its own. The
 * 15-minute TTL bounds staleness for what CAN change without a push (title, body,
 * status, review state) and for the window before the list sync sees a new head.
 *
 * A cache miss, a corrupt entry, or a Redis outage all fall through to GitHub —
 * behaviour is identical to today, just slower.
 */
const TTL_SECONDS = 15 * 60;

function cacheKey(repo: RepoRef, n: number, headSha: string): string {
  return `gh:pr-detail:${repo.owner}/${repo.name}:${n}:${headSha}`;
}

/** Cached JSON is untrusted (older shape, hand-edited, shared Redis) — re-validate. */
function decode(raw: string): PrDetail | null {
  try {
    return PrDetail.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function getPrDetail(
  container: Container,
  gh: GitHubClient,
  repo: RepoRef,
  n: number,
  headSha: string,
): Promise<PrDetail> {
  const key = cacheKey(repo, n, headSha);

  const cached = await container.cache.get(key);
  if (cached) {
    const hit = decode(cached);
    if (hit) return hit;
  }

  const detail = await gh.getPullRequest(repo, n);
  await container.cache.set(key, JSON.stringify(detail), TTL_SECONDS);
  return detail;
}
