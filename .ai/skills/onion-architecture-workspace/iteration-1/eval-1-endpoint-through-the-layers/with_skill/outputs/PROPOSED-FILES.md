# Proposed files (8)

## `server/src/modules/repos/constants.ts`

```ts
/**
 * F1 — repos module constants (extracted from routes.ts; no behaviour change).
 */

/** JobRunner kind for the asynchronous `git clone` job. */
export const CLONE_JOB_KIND = 'clone';

/** Clone depth — shallow clone (latest commit only) keeps imports fast. */
export const CLONE_DEPTH = 1;

/** Secret name (via the Secrets adapter) holding the GitHub PAT for private clones. */
export const GITHUB_TOKEN_SECRET = 'GITHUB_TOKEN';

/**
 * Parse `owner`/`repo` from a GitHub URL — supports both
 * `https://github.com/owner/repo(.git)` and `git@github.com:owner/repo.git`.
 */
export const GITHUB_URL_REGEX = /github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?\/?$/;

/** Username embedded into an authenticated https github.com clone URL. */
export const GIT_TOKEN_USERNAME = 'x-access-token';

/** Host for which a token is embedded into an https clone URL. */
export const GITHUB_HTTPS_HOST = 'github.com';

/** Rolling window of the repo activity rollup (GET /repos/:repoId/stats), in days. */
export const STATS_WINDOW_DAYS = 30;

/** One day in ms — used to derive the rollup's `since` bound. */
export const DAY_MS = 24 * 60 * 60 * 1000;
```

## `server/src/modules/repos/helpers.ts`

```ts
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
```

## `server/src/modules/repos/routes.ts`

```ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { RepoInput, RepoFileContent, RepoStats } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { RepoService } from './service.js';

/** Query for the in-app file viewer: the repo-relative path to read. */
const FileQuery = z.object({ path: z.string().min(1) });

/** `/repos/:repoId/stats` names its param `repoId` (the rollup is repo-scoped). */
const RepoIdParams = z.object({ repoId: z.string().uuid() });

/**
 * F1 — repos module. Transport layer only: parses requests, maps status
 * codes, and delegates all business logic to RepoService.
 *   POST   /repos              → add repo (parse URL, persist, enqueue real clone)
 *   GET    /repos              → list repos (workspace-scoped)
 *   GET    /repos/:repoId/stats → 30-day activity rollup (runs, findings, severities)
 *   POST   /repos/:id/refresh  → re-fetch clone + bump last_polled_at
 *   DELETE /repos/:id          → remove repo
 *
 * The clone runs as a JobRunner job (kind 'clone') — real `git clone` via the
 * GitClient adapter into <cloneDir>/<owner>/<repo>.
 */
export default async function reposRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new RepoService(app.container);

  // Register the clone job handler once.
  service.registerCloneJobHandler();

  app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    const { repo, created } = await service.add(workspaceId, userId, req.body.url);
    reply.status(created ? 201 : 200);
    return repo;
  });

  app.get('/repos', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get(
    '/repos/:repoId/stats',
    { schema: { params: RepoIdParams, response: { 200: RepoStats } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.stats(workspaceId, req.params.repoId);
    },
  );

  app.get(
    '/repos/:id/file',
    { schema: { params: IdParams, querystring: FileQuery, response: { 200: RepoFileContent } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.readFileContent(workspaceId, req.params.id, req.query.path);
    },
  );

  app.post('/repos/:id/refresh', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.refresh(workspaceId, req.params.id);
  });

  app.delete('/repos/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.remove(workspaceId, req.params.id);
    return { deleted: req.params.id };
  });
}
```

## `server/src/modules/repos/service.ts`

```ts
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
```

## `server/src/modules/reviews/repository.ts`

```ts
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { Finding, RunSummary, RunTrace } from '@devdigest/shared';

/**
 * A2 — review data-access. The ONLY layer touching the DB for the review
 * domain. Owns `reviews`, `findings`, and persists the
 * observability rows `agent_runs` + `run_traces` (one trace doc per run).
 * Workspace scoping is enforced via the PR (which carries workspace_id).
 *
 * The query implementations are colocated, split by aggregate, under
 * `./repository/` (review+findings, agent runs, pull). This class
 * composes them so its public API stays identical.
 */

import type { FindingRow, PullRow } from '../../db/rows.js';
export type { FindingRow, PullRow };

export type ReviewRow = typeof t.reviews.$inferSelect;

import * as reviewRepo from './repository/review.repo.js';
import * as runRepo from './repository/run.repo.js';
import * as pullRepo from './repository/pull.repo.js';
import type { RepoRunStats } from './repository/run.repo.js';
export type { RepoRunStats };

export class ReviewRepository {
  constructor(private db: Db) {}

  // ---- PR lookup (workspace-scoped) --------------------------------------

  getPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    return pullRepo.getPull(this.db, workspaceId, prId);
  }

  getRepo(repoId: string): Promise<typeof t.repos.$inferSelect | undefined> {
    return pullRepo.getRepo(this.db, repoId);
  }

  getPrFiles(prId: string): Promise<(typeof t.prFiles.$inferSelect)[]> {
    return pullRepo.getPrFiles(this.db, prId);
  }

  // ---- reviews + findings -------------------------------------------------

  insertReview(values: {
    workspaceId: string;
    prId: string;
    agentId: string | null;
    runId: string | null;
    kind: 'summary' | 'review';
    verdict: string | null;
    summary: string | null;
    score: number | null;
    model: string | null;
  }): Promise<ReviewRow> {
    return reviewRepo.insertReview(this.db, values);
  }

  insertFindings(reviewId: string, findings: Finding[]): Promise<FindingRow[]> {
    return reviewRepo.insertFindings(this.db, reviewId, findings);
  }

  /** Reviews for a PR (newest first), each with its findings. */
  reviewsForPull(prId: string): Promise<{ review: ReviewRow; findings: FindingRow[] }[]> {
    return reviewRepo.reviewsForPull(this.db, prId);
  }

  getReview(reviewId: string): Promise<ReviewRow | undefined> {
    return reviewRepo.getReview(this.db, reviewId);
  }

  /** In-flight runs for a PR (status='running') — the server-side source of
   *  truth for "which agents are running now". Joined with the agent name. */
  activeRunsForPull(
    workspaceId: string,
    prId: string,
  ): Promise<{ run_id: string; agent_id: string | null; agent_name: string | null; ran_at: string | null }[]> {
    return runRepo.activeRunsForPull(this.db, workspaceId, prId);
  }

  /** All runs for a PR (any status), newest first — the PR run history. */
  listRunsForPull(workspaceId: string, prId: string): Promise<RunSummary[]> {
    return runRepo.listRunsForPull(this.db, workspaceId, prId);
  }

  /**
   * Runs + finding severity buckets for ONE repo since `since` (drives
   * GET /repos/:repoId/stats). Lives here because `agent_runs` and `findings`
   * are the review domain's tables — the repos module reaches it through
   * `container.reviewRepo` rather than querying them itself.
   */
  repoRunStatsSince(workspaceId: string, repoId: string, since: Date): Promise<RepoRunStats> {
    return runRepo.repoRunStatsSince(this.db, workspaceId, repoId, since);
  }

  /** Delete one agent run (+ its trace via FK cascade). Workspace-scoped. */
  deleteAgentRun(workspaceId: string, runId: string): Promise<boolean> {
    return runRepo.deleteAgentRun(this.db, workspaceId, runId);
  }

  /** Mark a still-running run as cancelled (no-op if it already finished). */
  cancelRunIfRunning(runId: string): Promise<boolean> {
    return runRepo.cancelRunIfRunning(this.db, runId);
  }

  /** On boot: any run still 'running' is orphaned (its process died / restarted),
   *  so mark it failed. Prevents permanently stuck "running" runs in the UI. */
  reapStaleRunningRuns(): Promise<number> {
    return runRepo.reapStaleRunningRuns(this.db);
  }

  /** Delete a whole review (one agent's run) + its findings (cascade), scoped
   *  to the workspace. Returns false if not found in the workspace. */
  deleteReview(workspaceId: string, reviewId: string): Promise<boolean> {
    return reviewRepo.deleteReview(this.db, workspaceId, reviewId);
  }

  // ---- finding actions ----------------------------------------------------

  getFinding(findingId: string): Promise<FindingRow | undefined> {
    return reviewRepo.getFinding(this.db, findingId);
  }

  /** Resolve workspace_id + pr_id for a finding (via review → pr). */
  findingContext(
    findingId: string,
  ): Promise<{ finding: FindingRow; review: ReviewRow; pull: PullRow } | undefined> {
    return reviewRepo.findingContext(this.db, findingId);
  }

  setFindingAccepted(findingId: string, at: Date | null): Promise<FindingRow | undefined> {
    return reviewRepo.setFindingAccepted(this.db, findingId, at);
  }

  setFindingDismissed(findingId: string, at: Date | null): Promise<FindingRow | undefined> {
    return reviewRepo.setFindingDismissed(this.db, findingId, at);
  }

  // ---- observability: agent_runs + run_traces ----------------------------

  /** Create an agent_runs row in `running` state; returns its id (= the runId). */
  createAgentRun(values: {
    workspaceId: string;
    agentId: string | null;
    prId: string;
    provider: string | null;
    model: string | null;
  }): Promise<string> {
    return runRepo.createAgentRun(this.db, values);
  }

  completeAgentRun(
    runId: string,
    values: {
      status: 'done' | 'failed' | 'cancelled';
      durationMs: number;
      tokensIn: number;
      tokensOut: number;
      findingsCount: number;
      grounding: string;
      /** Review score (0-100); null on failed/cancelled runs. */
      score?: number | null;
      /** Findings that tripped the agent's gate; 0 on failed/cancelled runs. */
      blockers?: number | null;
      /** USD cost of the run; null when off-catalog or on failed/cancelled. */
      costUsd?: number | null;
      /** Failure reason (status='failed') / cancellation note. Null clears it. */
      error?: string | null;
    },
  ): Promise<void> {
    return runRepo.completeAgentRun(this.db, runId, values);
  }

  /** Record the head SHA a review ran against (PR-list freshness derivation). */
  markReviewed(prId: string, sha: string): Promise<void> {
    return pullRepo.markReviewed(this.db, prId, sha);
  }

  /** Persist the WHOLE run log as ONE document. PK = runId → agent_runs. */
  saveRunTrace(runId: string, trace: RunTrace): Promise<void> {
    return runRepo.saveRunTrace(this.db, runId, trace);
  }

  getRunTrace(runId: string): Promise<RunTrace | undefined> {
    return runRepo.getRunTrace(this.db, runId);
  }
}
```

## `server/src/modules/reviews/repository/run.repo.ts`

```ts
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { RunSummary, RunTrace } from '@devdigest/shared';

// ---- in-flight / history --------------------------------------------------

/** In-flight runs for a PR (status='running') — the server-side source of
 *  truth for "which agents are running now". Joined with the agent name. */
export async function activeRunsForPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<{ run_id: string; agent_id: string | null; agent_name: string | null; ran_at: string | null }[]> {
  const rows = await db
    .select({
      id: t.agentRuns.id,
      agentId: t.agentRuns.agentId,
      ranAt: t.agentRuns.ranAt,
      agentName: t.agents.name,
    })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.prId, prId),
        eq(t.agentRuns.status, 'running'),
      ),
    );
  return rows.map((r) => ({
    run_id: r.id,
    agent_id: r.agentId,
    agent_name: r.agentName ?? null,
    ran_at: r.ranAt ? r.ranAt.toISOString() : null,
  }));
}

/** All runs for a PR (any status), newest first — the PR run history. */
export async function listRunsForPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<RunSummary[]> {
  const rows = await db
    .select({ run: t.agentRuns, agentName: t.agents.name })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.prId, prId)))
    .orderBy(desc(t.agentRuns.ranAt));
  const runIds = rows.map(({ run }) => run.id);
  const sevMap = new Map<string, { CRITICAL: number; WARNING: number; SUGGESTION: number }>();
  if (runIds.length > 0) {
    const sevRows = await db
      .select({
        runId: t.reviews.runId,
        severity: t.findings.severity,
        cnt: sql<number>`count(*)::int`,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(and(inArray(t.reviews.runId, runIds), eq(t.reviews.kind, 'review')))
      .groupBy(t.reviews.runId, t.findings.severity);
    for (const row of sevRows) {
      if (!row.runId) continue;
      const entry = sevMap.get(row.runId) ?? { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
      if (row.severity === 'CRITICAL' || row.severity === 'WARNING' || row.severity === 'SUGGESTION') {
        entry[row.severity] = row.cnt;
      }
      sevMap.set(row.runId, entry);
    }
  }

  return rows.map(({ run, agentName }) => ({
    run_id: run.id,
    agent_id: run.agentId,
    agent_name: agentName ?? null,
    provider: run.provider,
    model: run.model,
    status: run.status,
    error: run.error,
    duration_ms: run.durationMs,
    tokens_in: run.tokensIn,
    tokens_out: run.tokensOut,
    cost_usd: run.costUsd,
    findings_count: run.findingsCount,
    grounding: run.grounding,
    ran_at: run.ranAt ? run.ranAt.toISOString() : null,
    score: run.score,
    blockers: run.blockers,
    sev_critical: sevMap.get(run.id)?.CRITICAL ?? null,
    sev_warning: sevMap.get(run.id)?.WARNING ?? null,
    sev_suggestion: sevMap.get(run.id)?.SUGGESTION ?? null,
  }));
}

// ---- per-repo rollup (GET /repos/:repoId/stats) ----------------------------

/**
 * Raw counts for one repo's review activity in a time window. Deliberately NOT
 * the wire shape: the buckets come back as the severities actually stored
 * (`findings.severity` is free text), and the caller maps them to the contract.
 */
export interface RepoRunStats {
  runs: number;
  findingsBySeverity: { severity: string; count: number }[];
}

/**
 * Runs + finding severity buckets for a repo since `since`.
 *
 * The repo is reached through the run's PR (`agent_runs.pr_id → pull_requests.repo_id`);
 * findings hang off the review the run produced (`findings.review_id → reviews.run_id`),
 * so a run that produced no review contributes to `runs` but to no bucket.
 * Workspace-scoped on `agent_runs.workspace_id` (tenancy guard), on top of the
 * caller's workspace check on the repo itself.
 */
export async function repoRunStatsSince(
  db: Db,
  workspaceId: string,
  repoId: string,
  since: Date,
): Promise<RepoRunStats> {
  const [runRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(t.agentRuns)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.agentRuns.prId))
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.pullRequests.repoId, repoId),
        gte(t.agentRuns.ranAt, since),
      ),
    );

  const sevRows = await db
    .select({ severity: t.findings.severity, count: sql<number>`count(*)::int` })
    .from(t.findings)
    .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
    .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.reviews.runId))
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.agentRuns.prId))
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.pullRequests.repoId, repoId),
        gte(t.agentRuns.ranAt, since),
      ),
    )
    .groupBy(t.findings.severity);

  return { runs: runRow?.count ?? 0, findingsBySeverity: sevRows };
}

/**
 * Delete one agent run (+ its trace via FK cascade) AND the review it produced.
 * Workspace-scoped. `reviews.run_id` has no FK to `agent_runs`, so the review
 * (and its findings, which DO cascade from `reviews`) must be removed explicitly
 * here — otherwise deleting a run from the timeline leaves its findings orphaned
 * in the Review Runs list below.
 */
export async function deleteAgentRun(
  db: Db,
  workspaceId: string,
  runId: string,
): Promise<boolean> {
  await db
    .delete(t.reviews)
    .where(and(eq(t.reviews.runId, runId), eq(t.reviews.workspaceId, workspaceId)));
  const rows = await db
    .delete(t.agentRuns)
    .where(and(eq(t.agentRuns.id, runId), eq(t.agentRuns.workspaceId, workspaceId)))
    .returning({ id: t.agentRuns.id });
  return rows.length > 0;
}

/** Mark a still-running run as cancelled (no-op if it already finished). */
export async function cancelRunIfRunning(db: Db, runId: string): Promise<boolean> {
  const rows = await db
    .update(t.agentRuns)
    .set({ status: 'cancelled' })
    .where(and(eq(t.agentRuns.id, runId), eq(t.agentRuns.status, 'running')))
    .returning({ id: t.agentRuns.id });
  return rows.length > 0;
}

/** On boot: any run still 'running' is orphaned (its process died / restarted),
 *  so mark it failed. Prevents permanently stuck "running" runs in the UI. */
export async function reapStaleRunningRuns(db: Db): Promise<number> {
  const rows = await db
    .update(t.agentRuns)
    .set({ status: 'failed' })
    .where(eq(t.agentRuns.status, 'running'))
    .returning({ id: t.agentRuns.id });
  return rows.length;
}

// ---- observability: agent_runs + run_traces -------------------------------

/** Create an agent_runs row in `running` state; returns its id (= the runId). */
export async function createAgentRun(
  db: Db,
  values: {
    workspaceId: string;
    agentId: string | null;
    prId: string;
    provider: string | null;
    model: string | null;
  },
): Promise<string> {
  const [row] = await db
    .insert(t.agentRuns)
    .values({
      workspaceId: values.workspaceId,
      agentId: values.agentId,
      prId: values.prId,
      provider: values.provider,
      model: values.model,
      status: 'running',
      source: 'local',
    })
    .returning({ id: t.agentRuns.id });
  return row!.id;
}

export async function completeAgentRun(
  db: Db,
  runId: string,
  values: {
    status: 'done' | 'failed' | 'cancelled';
    durationMs: number;
    tokensIn: number;
    tokensOut: number;
    findingsCount: number;
    grounding: string;
    /** Review score (0-100); null on failed/cancelled runs. */
    score?: number | null;
    /** Findings that tripped the agent's gate; 0 on failed/cancelled runs. */
    blockers?: number | null;
    /** USD cost of the run; null when the model is off-catalog or on failed/cancelled. */
    costUsd?: number | null;
    /** Failure reason (status='failed') / cancellation note. Null clears it. */
    error?: string | null;
  },
): Promise<void> {
  await db
    .update(t.agentRuns)
    .set({
      status: values.status,
      durationMs: values.durationMs,
      tokensIn: values.tokensIn,
      tokensOut: values.tokensOut,
      findingsCount: values.findingsCount,
      grounding: values.grounding,
      score: values.score ?? null,
      blockers: values.blockers ?? null,
      costUsd: values.costUsd ?? null,
      error: values.error ?? null,
    })
    .where(eq(t.agentRuns.id, runId));
}

/** Persist the WHOLE run log as ONE document. PK = runId → agent_runs. */
export async function saveRunTrace(db: Db, runId: string, trace: RunTrace): Promise<void> {
  await db
    .insert(t.runTraces)
    .values({ runId, trace })
    .onConflictDoUpdate({ target: t.runTraces.runId, set: { trace } });
}

export async function getRunTrace(db: Db, runId: string): Promise<RunTrace | undefined> {
  const [row] = await db.select().from(t.runTraces).where(eq(t.runTraces.runId, runId));
  return row ? (row.trace as RunTrace) : undefined;
}
```

## `server/src/vendor/shared/contracts/repo-stats.ts`

```ts
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
```

## `server/src/vendor/shared/index.ts`

```ts
/**
 * @devdigest/shared — single source of truth for cross-package contracts.
 *
 * Exports (Zod schemas + inferred TS types):
 *  - contracts/findings   Review, Finding, Severity, Verdict, FindingAction, trifecta
 *  - contracts/brief      Intent, BlastRadius, Risks, SmartDiff, Brief
 *  - contracts/knowledge  Conformance, Onboarding, EvalRun/EvalCase, MemoryItem,
 *                         Skill/CommunitySkill, ConventionCandidate, Agent
 *  - contracts/trace      RunTrace, RunEvent, RunLogLine (single-document trace)
 *  - contracts/platform   Settings, ConnTestResult, Repo, PrMeta/PrDetail, ContextDoc, …
 *  - contracts/repo-stats RepoStats (GET /repos/:repoId/stats — 30-day rollup)
 *  - adapters             adapter interfaces + ModelInfo
 *
 * Feature agents (A1–A6) and F2 import everything from here. The barrel is
 * stable — feature agents EXTEND with new files, they do not edit existing ones.
 */

export * from './contracts/findings.js';
export * from './contracts/review-api.js';
export * from './contracts/brief.js';
export * from './contracts/repo-file.js';
export * from './contracts/repo-stats.js';
export * from './contracts/knowledge.js';
export * from './contracts/trace.js';
export * from './contracts/platform.js';
export * from './contracts/why.js';
export * from './contracts/eval-ci.js';
export * from './contracts/observability.js';
export * from './contracts/productionize.js';
export * from './adapters.js';
```
