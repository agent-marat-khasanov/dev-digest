import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { Container } from '../../platform/container.js';
import { type Repo, type RepoFileContent, type RepoStats } from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { RepoRepository } from './repository.js';
import { parseRepoUrl, withGitHubToken, toRepoDto, toRepoStatsDto } from './helpers.js';
import {
  CLONE_JOB_KIND,
  CLONE_DEPTH,
  GITHUB_TOKEN_SECRET,
  STATS_WINDOW_DAYS,
  DAY_MS,
} from './constants.js';
import {
  INDEX_JOB_KIND,
  REFRESH_JOB_KIND,
} from '../repo-intel/constants.js';

/**
 * F1 — repos service. Business logic for the Repositories feature:
 *   - add / list / refresh / remove
 *   - the asynchronous `clone` job (real `git clone` via the GitClient adapter)
 *   - the 30-day activity rollup (GET /repos/:repoId/stats)
 *
 * No HTTP and no raw SQL live here — persistence goes through RepoRepository,
 * pure transforms through helpers.ts, literals through constants.ts.
 */

/** Payload enqueued for (and consumed by) the `clone` job. */
export interface CloneJobPayload {
  repoId: string;
  owner: string;
  name: string;
  url: string;
}

export class RepoService {
  private repo: RepoRepository;

  constructor(private container: Container) {
    this.repo = new RepoRepository(container.db);
  }

  /**
   * Register the `clone` job handler once. Authenticates the clone with the
   * stored GitHub PAT (so private repos work), clones via the GitClient adapter,
   * then persists the resulting path + last_polled_at.
   */
  registerCloneJobHandler(): void {
    this.container.jobs.register(CLONE_JOB_KIND, async (payload) => {
      await this.runCloneJob(payload as CloneJobPayload);
    });
  }

  async runCloneJob(payload: CloneJobPayload): Promise<void> {
    const { repoId, owner, name, url } = payload;
    const token = await this.container.secrets.get(GITHUB_TOKEN_SECRET);
    const cloneUrl = token ? withGitHubToken(url, token) : url;
    const { path } = await this.container.git.clone({ owner, name }, cloneUrl, {
      depth: CLONE_DEPTH,
    });
    await this.repo.updateClonePath(repoId, path);

    // T2.2 — kick off the indexer in the background. ENQUEUE (not call) so the
    // clone job closes immediately and the (heavier) index runs as its own
    // job under JobRunner's timeout/retry. If the handler isn't registered
    // (e.g. repo-intel disabled at module wiring), enqueue() throws — log and
    // continue so the clone result is preserved either way.
    const workspaceId = await this.repo.workspaceIdFor(repoId);
    if (workspaceId) {
      try {
        await this.container.jobs.enqueue(workspaceId, INDEX_JOB_KIND, {
          repoId,
          owner,
          name,
        });
      } catch {
        // No handler registered or transient enqueue failure — clone has
        // already succeeded, so we don't fail the job for an index-followup
        // miss. The user can hit POST /repos/:id/reindex to retry.
      }
    }
  }

  /**
   * Add a repo: parse the URL, dedupe within the workspace, persist, and enqueue
   * the real clone (non-blocking). `created` is false when the repo already
   * existed (the caller returns 200 instead of 201).
   */
  async add(
    workspaceId: string,
    userId: string,
    url: string,
  ): Promise<{ repo: Repo; created: boolean }> {
    const { owner, name } = parseRepoUrl(url);
    const fullName = `${owner}/${name}`;

    const existing = await this.repo.findByFullName(workspaceId, fullName);
    if (existing) return { repo: toRepoDto(existing), created: false };

    const row = await this.repo.insert({ workspaceId, owner, name, fullName, createdBy: userId });
    await this.container.jobs.enqueue(workspaceId, CLONE_JOB_KIND, {
      repoId: row.id,
      owner,
      name,
      url,
    } satisfies CloneJobPayload);

    return { repo: toRepoDto(row), created: true };
  }

  async list(workspaceId: string): Promise<Repo[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toRepoDto);
  }

  /**
   * Rolling 30-day review activity for one repo: how many agent runs it had, how
   * many findings those runs produced, and the split by severity.
   *
   * Workspace-scoped twice over: the repo must exist in this workspace (404
   * otherwise, so a foreign repo id is indistinguishable from a missing one),
   * and the rollup query itself filters `agent_runs.workspace_id`.
   *
   * The counts come from `agent_runs` + `findings`, which belong to the REVIEW
   * domain — so the SQL lives in `ReviewRepository`, resolved from the container
   * (the composition root already shares it as `container.reviewRepo`). This
   * module's own repository keeps owning only the `repos` table.
   */
  async stats(workspaceId: string, repoId: string): Promise<RepoStats> {
    const repo = await this.repo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const since = new Date(Date.now() - STATS_WINDOW_DAYS * DAY_MS);
    const rollup = await this.container.reviewRepo.repoRunStatsSince(workspaceId, repoId, since);
    return toRepoStatsDto(repo.id, STATS_WINDOW_DAYS, since, rollup);
  }

  /** Re-fetch the clone for an existing repo (enqueues a fresh `clone` job). */
  async refresh(workspaceId: string, id: string): Promise<{ status: 'refreshing' }> {
    const repo = await this.repo.getById(workspaceId, id);
    if (!repo) throw new NotFoundError('Repo not found');
    await this.container.jobs.enqueue(workspaceId, CLONE_JOB_KIND, {
      repoId: repo.id,
      owner: repo.owner,
      name: repo.name,
      url: `https://github.com/${repo.fullName}.git`,
    } satisfies CloneJobPayload);
    // T2.2 — also enqueue an incremental refresh. The two queue positions are
    // independent (p-queue doesn't FIFO across kinds), but `runIncremental` is
    // a no-op when `currentHead === lastIndexedSha`, so ordering is safe: if
    // refresh fires before the new clone settles, it cheaply exits; if after,
    // it picks up the new HEAD.
    try {
      await this.container.jobs.enqueue(workspaceId, REFRESH_JOB_KIND, {
        repoId: repo.id,
        owner: repo.owner,
        name: repo.name,
      });
    } catch {
      // No handler / transient enqueue failure — refresh button is best-effort.
    }
    return { status: 'refreshing' };
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const ok = await this.repo.remove(workspaceId, id);
    if (!ok) throw new NotFoundError('Repo not found');
  }

  /**
   * Read a single file from the repo's local clone, for the in-app Blast-tab
   * code viewer. Workspace-scoped (IDOR-safe via `getById`) and hardened against
   * path traversal: the resolved target MUST stay inside the clone root, so an
   * `owner`-controlled `relPath` like `../../etc/passwd` or an absolute path is
   * rejected. Size-capped to avoid serving huge blobs into the browser.
   */
  async readFileContent(
    workspaceId: string,
    repoId: string,
    relPath: string,
  ): Promise<RepoFileContent> {
    const repo = await this.repo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    if (!repo.clonePath) throw new NotFoundError('Repository is not cloned yet');

    const root = resolve(repo.clonePath);
    const target = resolve(root, relPath);
    if (target !== root && !target.startsWith(root + sep)) {
      throw new ValidationError('Path escapes the repository root');
    }

    let info;
    try {
      info = await stat(target);
    } catch {
      throw new NotFoundError('File not found');
    }
    if (!info.isFile()) throw new NotFoundError('File not found');
    if (info.size > MAX_VIEW_FILE_BYTES) {
      throw new ValidationError('File is too large to display');
    }

    const content = await readFile(target, 'utf8');
    return { path: relPath, content };
  }
}

/** Cap on a single file served to the in-app viewer (matches the indexer's per-file ceiling). */
const MAX_VIEW_FILE_BYTES = 400 * 1024;
