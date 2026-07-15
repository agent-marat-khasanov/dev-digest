# Proposed files (7)

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

/** Window of the repo activity rollup (GET /repos/:id/stats) — the last 30 days. */
export const STATS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
```

## `server/src/modules/repos/helpers.ts`

```ts
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
```

## `server/src/modules/repos/repository.ts`

```ts
import { and, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * F1 — repos data-access layer. The ONLY place that touches the `repos`
 * table. Every query is scoped by `workspaceId` (tenancy guard).
 *
 * It also READS the review-activity tables (`agent_runs` → `pull_requests`,
 * `reviews` → `findings`) for the repo stats rollup — writes to those stay with
 * the reviews module, exactly as the skills repository reads them for
 * GET /skills/:id/stats.
 */

export type RepoRow = typeof t.repos.$inferSelect;

export interface InsertRepo {
  workspaceId: string;
  owner: string;
  name: string;
  fullName: string;
  createdBy: string;
}

/** One `count(*) … GROUP BY severity` row of the findings rollup. */
export interface SeverityCount {
  severity: string;
  count: number;
}

export class RepoRepository {
  constructor(private db: Db) {}

  /** Find a repo in a workspace by its `owner/name` full name (dedupe on add). */
  async findByFullName(workspaceId: string, fullName: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, fullName)));
    return row;
  }

  async list(workspaceId: string): Promise<RepoRow[]> {
    return this.db.select().from(t.repos).where(eq(t.repos.workspaceId, workspaceId));
  }

  async getById(workspaceId: string, id: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, id)));
    return row;
  }

  async insert(values: InsertRepo): Promise<RepoRow> {
    const [row] = await this.db
      .insert(t.repos)
      .values({
        workspaceId: values.workspaceId,
        owner: values.owner,
        name: values.name,
        fullName: values.fullName,
        createdBy: values.createdBy,
      })
      .returning();
    return row!;
  }

  /**
   * Look up the workspace owning a repo (by repo id, no tenancy scope —
   * the JobRunner's `runCloneJob` is the only caller and it already trusted
   * the payload that came out of an authenticated `add()`). Returns null
   * if the repo was deleted before the followup ran.
   */
  async workspaceIdFor(repoId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ workspaceId: t.repos.workspaceId })
      .from(t.repos)
      .where(eq(t.repos.id, repoId));
    return row?.workspaceId ?? null;
  }

  /** Persist the clone path and bump `last_polled_at` once a clone job completes. */
  async updateClonePath(repoId: string, clonePath: string): Promise<void> {
    await this.db
      .update(t.repos)
      .set({ clonePath, lastPolledAt: new Date() })
      .where(eq(t.repos.id, repoId));
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, id)))
      .returning({ id: t.repos.id });
    return deleted.length > 0;
  }

  // ---- Stats data fetchers (raw counts — the DTO shaping lives in helpers) --

  /**
   * Review runs (any status — the history includes failures) fired at any PR of
   * this repo since `since`. `agent_runs` carries `workspace_id` itself, so the
   * tenancy guard holds even though the repo link goes through `pull_requests`.
   */
  async countRunsSince(workspaceId: string, repoId: string, since: Date): Promise<number> {
    const [row] = await this.db
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
    return row?.count ?? 0;
  }

  /**
   * Findings produced by those same runs, grouped by severity. The join walks
   * findings → reviews → agent_runs → pull_requests, so a finding is counted
   * against the window of the RUN that produced it (not its own timestamp — it
   * has none). `kind='review'` mirrors the per-run severity rollup in the
   * reviews repository: a `summary` review never carries findings of its own,
   * and filtering here keeps it that way if that ever changes.
   */
  async findingsBySeveritySince(
    workspaceId: string,
    repoId: string,
    since: Date,
  ): Promise<SeverityCount[]> {
    return this.db
      .select({ severity: t.findings.severity, count: sql<number>`count(*)::int` })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.reviews.runId))
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.agentRuns.prId))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.pullRequests.repoId, repoId),
          eq(t.reviews.kind, 'review'),
          gte(t.agentRuns.ranAt, since),
        ),
      )
      .groupBy(t.findings.severity);
  }
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

/**
 * F1 — repos module. Transport layer only: parses requests, maps status
 * codes, and delegates all business logic to RepoService.
 *   POST   /repos              → add repo (parse URL, persist, enqueue real clone)
 *   GET    /repos              → list repos (workspace-scoped)
 *   GET    /repos/:id/stats    → 30-day rollup: runs, findings, severity split
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
    '/repos/:id/file',
    { schema: { params: IdParams, querystring: FileQuery, response: { 200: RepoFileContent } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.readFileContent(workspaceId, req.params.id, req.query.path);
    },
  );

  app.get(
    '/repos/:id/stats',
    { schema: { params: IdParams, response: { 200: RepoStats } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.stats(workspaceId, req.params.id);
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
  STATS_WINDOW_MS,
} from './constants.js';
import {
  INDEX_JOB_KIND,
  REFRESH_JOB_KIND,
} from '../repo-intel/constants.js';

/**
 * F1 — repos service. Business logic for the Repositories feature:
 *   - add / list / refresh / remove
 *   - the 30-day review-activity rollup (`stats`)
 *   - the asynchronous `clone` job (real `git clone` via the GitClient adapter)
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
   * 30-day review-activity rollup for one repo: how many review runs it had,
   * how many findings those runs produced, and the breakdown by severity.
   * Workspace-scoped (IDOR-safe): an id from another workspace 404s here, and
   * the two aggregate queries are themselves scoped to the workspace.
   */
  async stats(workspaceId: string, repoId: string): Promise<RepoStats> {
    const repo = await this.repo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const since = new Date(Date.now() - STATS_WINDOW_MS);
    const [runs, bySeverity] = await Promise.all([
      this.repo.countRunsSince(workspaceId, repoId, since),
      this.repo.findingsBySeveritySince(workspaceId, repoId, since),
    ]);
    return toRepoStatsDto(repoId, since, runs, bySeverity);
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

## `server/src/vendor/shared/contracts/repo-stats.ts`

```ts
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
