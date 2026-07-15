import { PrDetail } from '@devdigest/shared';
import type {
  GitHubClient,
  RepoRef,
  PrMeta,
  GitHubReviewPayload,
  CreateReviewCommentInput,
  PrReviewComment,
  OpenPrPayload,
  CommitFilesPayload,
  IssueMeta,
} from '@devdigest/shared';
import type { Cache } from '../cache/index.js';

/**
 * CachedGitHubClient — a caching DECORATOR over another GitHubClient.
 *
 * Why a decorator: re-running a review on a PR re-reads the PR detail (which is
 * where the whole changed-file list comes from — `pulls.get` + `pulls.listFiles`
 * + `pulls.listCommits` + the linked issue, i.e. ~4 REST calls per read), and
 * that burned the GitHub rate limit. The cache is an INFRASTRUCTURE concern, so
 * it goes where the GitHub I/O already lives: it implements the same
 * `GitHubClient` port, wraps the real one, and is composed in the Container.
 * No service, route or contract changes — the application ring still only ever
 * sees `GitHubClient`, and a container without a cache wires the bare Octokit
 * client (identical behavior, zero caching).
 *
 * Only `getPullRequest` is cached — it is the read the task is about. Every
 * other method (writes, comments, issues, list) delegates straight through.
 *
 * KEYING — repo + PR number + head sha:
 *   detail  `…:<owner>/<name>:<number>:<headSha>` → the PrDetail JSON
 *   pointer `…:<owner>/<name>:<number>:head`      → which head sha is current
 * The detail entry is content-addressed by the sha it was fetched at, so a cached
 * file list can never be served for a different commit. The pointer is what makes
 * a sha-keyed entry findable: the port's signature is `(repo, n)` — the caller
 * does not (and should not) pass a cache key — so the decorator has to remember
 * the sha itself. `listPullRequests` (the PR-list sync that the UI/poller runs
 * before any PR read) already returns each PR's CURRENT head sha, so we refresh
 * the pointers from it for free: a new commit moves the pointer, the sha-keyed
 * detail misses, and GitHub is re-read immediately instead of after the TTL.
 * Absent a list sync, staleness is bounded by the 15-minute TTL.
 */

const TTL_SECONDS = 15 * 60;

/** `v1` namespaces the PrDetail shape: change the contract → bump it, never serve an old shape. */
const KEY_PREFIX = 'devdigest:gh:pr:v1';

export class CachedGitHubClient implements GitHubClient {
  constructor(
    private readonly inner: GitHubClient,
    private readonly cache: Cache,
  ) {}

  // ---- cached read --------------------------------------------------------

  async getPullRequest(repo: RepoRef, n: number): Promise<PrDetail> {
    const headSha = await this.cache.get(this.headKey(repo, n));
    if (headSha) {
      const hit = await this.readDetail(repo, n, headSha);
      if (hit) return hit;
    }
    const detail = await this.inner.getPullRequest(repo, n);
    await this.remember(repo, n, detail);
    return detail;
  }

  async listPullRequests(repo: RepoRef): Promise<PrMeta[]> {
    const pulls = await this.inner.listPullRequests(repo);
    // Free head-sha refresh (see the keying note above) — the list payload is
    // authoritative about each PR's current head.
    await Promise.all(
      pulls.map((pr) => this.cache.set(this.headKey(repo, pr.number), pr.head_sha, TTL_SECONDS)),
    );
    return pulls;
  }

  // ---- keys & (de)serialization -------------------------------------------

  private headKey(repo: RepoRef, n: number): string {
    return `${KEY_PREFIX}:${repo.owner}/${repo.name}:${n}:head`;
  }

  private detailKey(repo: RepoRef, n: number, headSha: string): string {
    return `${KEY_PREFIX}:${repo.owner}/${repo.name}:${n}:${headSha}`;
  }

  /** Read + validate a cached entry. Anything unparsable is treated as a miss. */
  private async readDetail(repo: RepoRef, n: number, headSha: string): Promise<PrDetail | null> {
    const raw = await this.cache.get(this.detailKey(repo, n, headSha));
    if (!raw) return null;
    try {
      const parsed = PrDetail.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private async remember(repo: RepoRef, n: number, detail: PrDetail): Promise<void> {
    await this.cache.set(
      this.detailKey(repo, n, detail.head_sha),
      JSON.stringify(detail),
      TTL_SECONDS,
    );
    await this.cache.set(this.headKey(repo, n), detail.head_sha, TTL_SECONDS);
  }

  // ---- pass-through -------------------------------------------------------

  async postReview(
    repo: RepoRef,
    n: number,
    review: GitHubReviewPayload,
  ): Promise<{ id: string }> {
    return this.inner.postReview(repo, n, review);
  }

  async listReviewComments(repo: RepoRef, n: number): Promise<PrReviewComment[]> {
    return this.inner.listReviewComments(repo, n);
  }

  async createReviewComment(
    repo: RepoRef,
    n: number,
    input: CreateReviewCommentInput,
  ): Promise<PrReviewComment> {
    return this.inner.createReviewComment(repo, n, input);
  }

  async openPullRequest(repo: RepoRef, payload: OpenPrPayload): Promise<{ url: string }> {
    return this.inner.openPullRequest(repo, payload);
  }

  async commitFiles(repo: RepoRef, payload: CommitFilesPayload): Promise<{ branch: string }> {
    return this.inner.commitFiles(repo, payload);
  }

  async findOpenPr(repo: RepoRef, branch: string): Promise<{ url: string } | null> {
    return this.inner.findOpenPr(repo, branch);
  }

  async getIssue(repo: RepoRef, n: number): Promise<IssueMeta> {
    return this.inner.getIssue(repo, n);
  }

  async currentLogin(): Promise<string> {
    return this.inner.currentLogin();
  }
}
