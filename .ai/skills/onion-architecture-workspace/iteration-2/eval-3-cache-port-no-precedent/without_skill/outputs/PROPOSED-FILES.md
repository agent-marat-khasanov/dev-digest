# Proposed files (10)

## `docker-compose.yml`

```ts
name: devdigest

services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: devdigest-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: devdigest
      POSTGRES_PASSWORD: devdigest
      POSTGRES_DB: devdigest
    ports:
      - "5432:5432"
    volumes:
      - devdigest_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U devdigest -d devdigest"]
      interval: 5s
      timeout: 5s
      retries: 10

  # Cache in front of the GitHub PR-detail reads (REDIS_URL). Ephemeral by
  # design — no volume: everything in it is a 15-minute copy of data we can
  # re-fetch from GitHub, so a wiped Redis costs a few API calls, nothing more.
  redis:
    image: redis:7-alpine
    container_name: devdigest-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  devdigest_pgdata:
    name: devdigest_pgdata
```

## `server/.env.example`

```sh
# @devdigest/api environment
DATABASE_URL=postgres://devdigest:devdigest@localhost:5432/devdigest

# Redis — cache in front of the GitHub PR-detail reads (15-min TTL, keyed by
# repo + PR + head sha) so re-running a review on the same PR doesn't re-fetch
# its file list. OPTIONAL: leave empty to run without a cache (every read hits
# GitHub, as before). `docker compose up -d` starts one on this URL.
REDIS_URL=redis://localhost:6379

# LLM providers (BYO key — entered via Settings UI in prod; env for local dev).
# Optional: the app boots with none. A key is only needed for the provider you
# actually run a review on (or embeddings, see EMBEDDINGS_ENABLED).
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OPENROUTER_API_KEY=

# GitHub (REST via Octokit) — PAT with repo scope. Canonical name is
# GITHUB_TOKEN; GITHUB_PAT is still accepted as a fallback for back-compat.
GITHUB_TOKEN=

# Memory/RAG embeddings (OpenAI text-embedding-3-small). Default OFF → the app
# makes ZERO OpenAI requests. Set true to enable memory retrieval.
EMBEDDINGS_ENABLED=false

# repo-intel facade (Tier 1: repo skeleton + callers in the review prompt).
# Default ON; set false to degrade every consumer to ripgrep-only behavior.
REPO_INTEL_ENABLED=true

API_PORT=3001
WEB_PORT=3000
NODE_ENV=development
# fatal | error | warn | info | debug | trace | silent (defaults: info, silent in test)
LOG_LEVEL=
DEVDIGEST_CLONE_DIR=./clones

# Comma-separated top-level folder names (exact segment match, any depth) the
# project-context discovery walk scans for .md docs.
CONTEXT_ROOTS=specs,docs,insights
```

## `server/package.json`

```json
{
  "name": "@devdigest/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "verify:l03": "vitest run src/modules/smart-diff/classify.test.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:seed": "tsx src/db/seed.ts"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.33.1",
    "@ast-grep/napi": "0.43.0",
    "@fastify/autoload": "^6.0.3",
    "@fastify/cors": "^10.0.2",
    "@fastify/helmet": "^13.0.2",
    "@fastify/rate-limit": "^11.0.0",
    "@vscode/ripgrep": "^1.15.9",
    "dependency-cruiser": "^17.4.3",
    "diff": "^9.0.0",
    "dotenv": "^16.4.7",
    "drizzle-orm": "^0.38.3",
    "fastify": "^5.2.0",
    "fastify-sse-v2": "^4.2.1",
    "fastify-type-provider-zod": "^4.0.2",
    "graphology": "^0.26.0",
    "graphology-metrics": "^2.4.0",
    "ioredis": "^5.4.1",
    "js-tiktoken": "^1.0.21",
    "octokit": "^4.0.3",
    "openai": "^4.77.0",
    "p-queue": "^8.0.1",
    "postgres": "^3.4.5",
    "simple-git": "^3.27.0",
    "yauzl": "^3.4.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@testcontainers/postgresql": "^10.16.0",
    "@types/diff": "^8.0.0",
    "@types/node": "^22.10.0",
    "@types/yauzl": "^3.4.0",
    "@types/yazl": "^3.3.1",
    "drizzle-kit": "^0.30.1",
    "pino-pretty": "^13.0.0",
    "testcontainers": "^10.16.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8",
    "yazl": "^3.3.1"
  }
}
```

## `server/src/adapters/cache/index.ts`

```ts
/**
 * cache adapter — key/value store with TTL, in front of hot external reads.
 *
 * The port lives next to its implementations (same shape as depgraph/tokenizer):
 * it is server-internal infrastructure, not part of the shared contracts, so
 * nothing outside `server/` codes against it.
 *
 * Values are opaque strings; encoding/validation is the caller's job (the PR
 * detail cache stores JSON and re-validates it against the Zod contract on read).
 *
 * HARD RULE — a cache must never fail its caller. Implementations swallow their
 * own transport errors: a miss and an outage look identical from the outside, so
 * a dead Redis degrades to "no cache", never to a broken endpoint.
 */
export interface Cache {
  /** The stored value, or null on a miss (or any cache-side failure). */
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/**
 * Default when REDIS_URL is unset: every read misses, every write is a no-op.
 * The app boots and behaves exactly as it did before the cache existed.
 */
export class NoopCache implements Cache {
  async get(): Promise<string | null> {
    return null;
  }

  async set(): Promise<void> {}
}

export { RedisCache } from './redis.js';
```

## `server/src/adapters/cache/redis.ts`

```ts
import Redis from 'ioredis';
import type { Cache } from './index.js';

/**
 * Cache over Redis (ioredis). Connection string comes from REDIS_URL.
 *
 * Configured to fail FAST and QUIETLY rather than to be reliable — this is a
 * rate-limit shield, not a source of truth:
 *   - `lazyConnect`: no socket is opened until the first get/set, so a boot with
 *     an unreachable Redis is still a clean boot.
 *   - `commandTimeout` / `connectTimeout`: a hung Redis adds at most ~1s to a
 *     request instead of stalling it behind the GitHub call it was meant to save.
 *   - `maxRetriesPerRequest: 1`: don't pile retries on top of an outage.
 *   - the mandatory `error` listener: ioredis emits connection errors as events,
 *     and an unhandled 'error' event would take the process down. Cache failures
 *     are absorbed here and surface to the caller as a plain miss — the same
 *     silent-degradation contract the depgraph/tokenizer/price-book adapters use.
 */
export class RedisCache implements Cache {
  private redis: Redis;

  constructor(url: string) {
    this.redis = new Redis(url, {
      lazyConnect: true,
      connectTimeout: 2_000,
      commandTimeout: 1_000,
      maxRetriesPerRequest: 1,
    });
    this.redis.on('error', () => {
      /* absorbed: a broken cache must not crash the API (see class doc) */
    });
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } catch {
      /* a write we couldn't make is just a future miss */
    }
  }
}
```

## `server/src/adapters/index.ts`

```ts
/** Adapter barrel — real + mock implementations behind the adapter interfaces. */
export { LocalSecretsProvider } from './secrets/local.js';
export { LocalNoAuthProvider } from './auth/local.js';
export { OpenAIProvider } from './llm/openai.js';
export { AnthropicProvider } from './llm/anthropic.js';
export { OpenAIEmbedder } from './embedder/openai.js';
export { OctokitGitHubClient } from './github/octokit.js';
export { SimpleGitClient } from './git/simple-git.js';
export { parseUnifiedDiff } from './git/diff-parser.js';
export { RipgrepCodeIndex } from './codeindex/ripgrep.js';
export { type Cache, NoopCache, RedisCache } from './cache/index.js';
export { estimateCost } from './llm/pricing.js';
export * from './mocks.js';
```

## `server/src/modules/pulls/pr-detail-cache.ts`

```ts
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
```

## `server/src/modules/pulls/routes.ts`

```ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { PrMeta, PrDetail, GitHubClient, PrReviewComment } from '@devdigest/shared';
import { PrCommentInput } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { deriveReviewStatus } from './status.js';
import { getPrDetail } from './pr-detail-cache.js';

/**
 * F1 — pulls module. PR import via Octokit (list + per-PR detail).
 *   GET /repos/:id/pulls → list PRs for a repo (open + recently merged/closed,
 *                          synced from GitHub, persisted). `status` is GitHub's
 *                          merge state (open/merged/closed).
 *   GET /pulls/:id       → full PR detail (diff/files, commits, body, linked issue)
 *
 * Import is idempotent (unique repo_id+number). Review trigger is MANUAL
 * and owned by A2 — this module only imports/reads.
 */
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
    const { workspaceId } = await getContext(container, req);
    const [repo] = await container.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
    if (!repo) throw new NotFoundError('Repo not found');

    let gh: GitHubClient | null = null;
    try {
      gh = await container.github();
    } catch (err) {
      app.log.warn({ err }, 'GitHub client unavailable (no token / offline); serving persisted PRs');
    }

    // Local-first: sync from GitHub when a token is configured, but never
    // fail the read — already-imported/seeded PRs stay viewable offline.
    if (gh) {
      try {
        const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
        for (const pr of pulls) {
          await container.db
            .insert(t.pullRequests)
            .values({
              workspaceId,
              repoId: repo.id,
              number: pr.number,
              title: pr.title,
              author: pr.author,
              branch: pr.branch,
              base: pr.base,
              headSha: pr.head_sha,
              additions: pr.additions,
              deletions: pr.deletions,
              filesCount: pr.files_count,
              status: pr.status,
              openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
              updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
            })
            .onConflictDoUpdate({
              target: [t.pullRequests.repoId, t.pullRequests.number],
              set: {
                title: pr.title,
                headSha: pr.head_sha,
                status: pr.status,
                updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
              },
            });
        }
      } catch (err) {
        app.log.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    const rows = await container.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.repoId, repo.id));

    // Diff stats aren't on GitHub's PR-list payload, so freshly-imported PRs
    // land with zeroed size/diff. Backfill them once from the detail endpoint
    // so the list shows real S/M/L + ± counts. Capped per request (each backfill
    // is a detail fetch) — the periodic refetch chips away at any remainder.
    const BACKFILL_LIMIT = 10;
    if (gh) {
      const needStats = rows
        .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
        .slice(0, BACKFILL_LIMIT);
      for (const r of needStats) {
        try {
          const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, r.number);
          await container.db
            .update(t.pullRequests)
            .set({
              additions: detail.additions,
              deletions: detail.deletions,
              filesCount: detail.files_count,
            })
            .where(eq(t.pullRequests.id, r.id));
          r.additions = detail.additions;
          r.deletions = detail.deletions;
          r.filesCount = detail.files_count;
        } catch (err) {
          app.log.warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
        }
      }
    }

    // Latest-review SCORE per PR for the list's score ring. Computed on read
    // from reviews (no FK denorm); the list is small, so one IN-query + JS
    // grouping is cheap.
    const prIds = rows.map((r) => r.id);
    const latestReviewByPr = new Map<string, { score: number | null }>();
    const costByPr = new Map<string, number>();
    const findingsByPr = new Map<string, { CRITICAL: number; WARNING: number; SUGGESTION: number }>();
    if (prIds.length > 0) {
      const reviewRows = await container.db
        .select({ prId: t.reviews.prId, score: t.reviews.score })
        .from(t.reviews)
        .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
        .orderBy(desc(t.reviews.createdAt));
      // Rows are newest-first → first seen per PR is the latest review.
      for (const rv of reviewRows) {
        if (!latestReviewByPr.has(rv.prId)) latestReviewByPr.set(rv.prId, { score: rv.score });
      }

      // Per-PR total cost = SUM(cost_usd) over all done agent_runs. Failed/
      // cancelled/running runs are excluded; runs predating migration 0010 hold
      // null cost_usd and contribute 0 to the sum (Postgres SUM ignores nulls).
      const costRows = await container.db
        .select({
          prId: t.agentRuns.prId,
          cost: sql<number | null>`sum(${t.agentRuns.costUsd})`,
        })
        .from(t.agentRuns)
        .where(
          and(
            inArray(t.agentRuns.prId, prIds),
            eq(t.agentRuns.status, 'done'),
          ),
        )
        .groupBy(t.agentRuns.prId);
      for (const c of costRows) {
        if (c.prId != null && c.cost != null) {
          costByPr.set(c.prId, Number(c.cost));
        }
      }

      const findingsRows = await container.db
        .select({
          prId: t.reviews.prId,
          severity: t.findings.severity,
          cnt: sql<number>`count(*)::int`,
        })
        .from(t.findings)
        .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
        .where(
          and(
            inArray(t.reviews.prId, prIds),
            eq(t.reviews.kind, 'review'),
          ),
        )
        .groupBy(t.reviews.prId, t.findings.severity);
      for (const row of findingsRows) {
        if (!row.prId) continue;
        const entry = findingsByPr.get(row.prId) ?? { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
        if (row.severity === 'CRITICAL' || row.severity === 'WARNING' || row.severity === 'SUGGESTION') {
          entry[row.severity] = row.cnt;
        }
        findingsByPr.set(row.prId, entry);
      }
    }

    const now = Date.now();
    return rows.map((r) => {
      const review = latestReviewByPr.get(r.id);
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        author: r.author,
        branch: r.branch,
        base: r.base,
        head_sha: r.headSha,
        additions: r.additions,
        deletions: r.deletions,
        files_count: r.filesCount,
        status: deriveReviewStatus({
          ghStatus: r.status,
          lastReviewedSha: r.lastReviewedSha,
          headSha: r.headSha,
          updatedAt: r.updatedAt,
          now,
        }),
        opened_at: r.openedAt?.toISOString() ?? null,
        updated_at: r.updatedAt?.toISOString() ?? null,
        score: review ? review.score : null,
        cost_usd: costByPr.get(r.id) ?? null,
        findings_by_severity: findingsByPr.get(r.id) ?? null,
      };
    });
  });

  app.get('/pulls/:id', { schema: { params: IdParams } }, async (req): Promise<PrDetail> => {
    const { workspaceId } = await getContext(container, req);
    const [pr] = await container.db
      .select()
      .from(t.pullRequests)
      .where(
        and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, req.params.id)),
      );
    if (!pr) throw new NotFoundError('Pull request not found');
    const [repo] = await container.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.id, pr.repoId));
    if (!repo) throw new NotFoundError('Repo not found');

    // Local-first: refresh detail from GitHub when a token is configured;
    // otherwise serve the persisted files/commits/body (seeded or previously
    // imported) so PR detail works offline.
    //
    // The GitHub read goes through getPrDetail, a read-through Redis cache keyed
    // by repo + PR + head sha (15-min TTL) — re-reviewing an unchanged PR no
    // longer re-fetches its whole file list from GitHub. The persistence below
    // is unchanged and still runs on a cache hit (it is local and cheap; the
    // rate limit is what we are protecting, not the DB).
    try {
      const gh = await container.github();
      const detail = await getPrDetail(
        container,
        gh,
        { owner: repo.owner, name: repo.name },
        pr.number,
        pr.headSha,
      );

      await container.db.delete(t.prFiles).where(eq(t.prFiles.prId, pr.id));
      if (detail.files.length > 0) {
        await container.db.insert(t.prFiles).values(
          detail.files.map((f) => ({
            prId: pr.id,
            path: f.path,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch ?? null,
          })),
        );
      }
      await container.db.delete(t.prCommits).where(eq(t.prCommits.prId, pr.id));
      if (detail.commits.length > 0) {
        await container.db.insert(t.prCommits).values(
          detail.commits.map((c) => ({
            prId: pr.id,
            sha: c.sha,
            message: c.message,
            author: c.author,
            committedAt: c.committed_at ? new Date(c.committed_at) : null,
          })),
        );
      }
      await container.db
        .update(t.pullRequests)
        .set({
          body: detail.body ?? null,
          // Diff stats aren't on GitHub's PR-list payload — backfill them from
          // the detail fetch so the Pull Requests list shows real size/files.
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        })
        .where(eq(t.pullRequests.id, pr.id));

      return { ...detail, id: pr.id };
    } catch (err) {
      app.log.warn({ err }, 'GitHub PR detail refresh skipped (no token / offline); serving persisted detail');
      const files = await container.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr.id));
      const commits = await container.db.select().from(t.prCommits).where(eq(t.prCommits.prId, pr.id));
      return {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        branch: pr.branch,
        base: pr.base,
        head_sha: pr.headSha,
        additions: pr.additions,
        deletions: pr.deletions,
        files_count: pr.filesCount,
        status: pr.status as PrDetail['status'],
        opened_at: pr.openedAt?.toISOString() ?? null,
        updated_at: pr.updatedAt?.toISOString() ?? null,
        body: pr.body ?? null,
        files: files.map((f) => ({
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
        commits: commits.map((c) => ({
          sha: c.sha,
          message: c.message,
          author: c.author,
          committed_at: c.committedAt?.toISOString() ?? null,
        })),
      };
    }
  });

  // ---- Inline review comments (Files changed tab) -------------------------
  // Proxied live to GitHub (no local persistence): GET reflects existing PR
  // comments; POST creates one immediately. Keeps the tab in lock-step with
  // GitHub and avoids a stale local mirror.
  async function resolvePrAndRepo(id: string, workspaceId: string) {
    const [pr] = await container.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, id)));
    if (!pr) throw new NotFoundError('Pull request not found');
    const [repo] = await container.db.select().from(t.repos).where(eq(t.repos.id, pr.repoId));
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }

  app.get(
    '/pulls/:id/comments',
    { schema: { params: IdParams } },
    async (req): Promise<PrReviewComment[]> => {
      const { workspaceId } = await getContext(container, req);
      const { pr, repo } = await resolvePrAndRepo(req.params.id, workspaceId);
      let gh: GitHubClient;
      try {
        gh = await container.github();
      } catch (err) {
        app.log.warn({ err }, 'GitHub client unavailable; serving no PR comments');
        return [];
      }
      try {
        return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
      } catch (err) {
        app.log.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
        return [];
      }
    },
  );

  app.post(
    '/pulls/:id/comments',
    { schema: { params: IdParams, body: PrCommentInput } },
    async (req): Promise<PrReviewComment> => {
      const { workspaceId } = await getContext(container, req);
      const { pr, repo } = await resolvePrAndRepo(req.params.id, workspaceId);
      const input = req.body;
      let gh: GitHubClient;
      try {
        gh = await container.github();
      } catch {
        throw new AppError(
          'github_unavailable',
          'Connect a GitHub token to post comments.',
          400,
        );
      }
      try {
        return await gh.createReviewComment({ owner: repo.owner, name: repo.name }, pr.number, {
          commitId: pr.headSha,
          path: input.path,
          line: input.line,
          ...(input.side ? { side: input.side } : {}),
          body: input.body,
          ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
        });
      } catch (err) {
        // GitHub rejects comments on lines outside the diff / on closed PRs (422).
        const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
        throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
      }
    },
  );
}
```

## `server/src/platform/config.ts`

```ts
import 'dotenv/config';
import { z } from 'zod';
import { homedir } from 'node:os';
import { join, isAbsolute, resolve } from 'node:path';

/**
 * Central, zod-validated environment config. Loaded once at startup.
 *
 * NOTE: secret keys (OPENAI/ANTHROPIC/OPENROUTER/GITHUB_TOKEN) are deliberately
 * NOT in this schema. Feature code must access secrets through SecretsProvider,
 * never via process.env or AppConfig — the SecretsProvider is the one chokepoint
 * that reads process.env directly (see adapters/secrets/local.ts). Listing them
 * here would be dead config that never reaches AppConfig.
 */
const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .default('postgres://devdigest:devdigest@localhost:5432/devdigest'),
  // Memory/RAG embeddings run on OpenAI (text-embedding-3-small, 1536-dim — the
  // pgvector columns are locked to that). Default OFF so the app makes ZERO
  // OpenAI requests; set EMBEDDINGS_ENABLED=true to turn memory retrieval on.
  EMBEDDINGS_ENABLED: z.string().optional(),
  // repo-intel facade (Tier 1). Default ON — reviews get repo skeleton +
  // callers context. Set REPO_INTEL_ENABLED=false to opt out, in which case
  // every consumer degrades to ripgrep-identical behavior (acceptance #10).
  // Note: even when on, sections only populate once the repo is indexed; an
  // unindexed repo degrades gracefully. Per-agent override: agents.repo_intel.
  REPO_INTEL_ENABLED: z.string().optional(),
  // Redis, used purely as a cache in front of hot GitHub reads (PR detail).
  // Optional: unset/empty → the app runs with a no-op cache and every read goes
  // to GitHub, exactly as before. Not a secret store — it holds only public PR
  // metadata we already fetched — so, like DATABASE_URL, it lives in config
  // rather than behind SecretsProvider.
  REDIS_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  API_PORT: z.coerce.number().int().default(3001),
  WEB_PORT: z.coerce.number().int().default(3000),
  DEVDIGEST_CLONE_DIR: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // `.env` (and .env.example) ship `LOG_LEVEL=` empty; an empty string is not a
  // valid enum member, so coerce '' → undefined to fall through to the default.
  LOG_LEVEL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  ),
  // Comma-separated top-level folder names the context discovery walk matches
  // as root segments (any depth). Default covers the course's own doc roots.
  CONTEXT_ROOTS: z.string().default('specs,docs,insights'),
});

export type AppConfig = {
  databaseUrl: string;
  /** Redis connection string for the GitHub read cache; undefined → cache off. */
  redisUrl: string | undefined;
  apiPort: number;
  webPort: number;
  /** Absolute path where repos are cloned (~/.devdigest/workspace by default). */
  cloneDir: string;
  /** Absolute path to the writable secrets store (BYO keys from the UI). */
  secretsPath: string;
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: string;
  /** Allowed CORS origin for the Next.js dev server. */
  webOrigin: string;
  /** Whether memory/RAG embeddings (OpenAI) are enabled. Default false. */
  embeddingsEnabled: boolean;
  /**
   * Whether the repo-intel facade (Tier 1: phantom-gate, callers-in-prompt) is
   * active. Default ON — set REPO_INTEL_ENABLED=false to opt out, in which case
   * every facade method returns its degraded result (`[]`) so consumers behave
   * EXACTLY like the ripgrep-only baseline.
   */
  repoIntelEnabled: boolean;
  /** Root folder names (exact segment match, any depth) for context discovery. */
  contextRoots: string[];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  const cloneDirRaw =
    parsed.DEVDIGEST_CLONE_DIR ?? join(homedir(), '.devdigest', 'workspace');
  const cloneDir = isAbsolute(cloneDirRaw) ? cloneDirRaw : resolve(process.cwd(), cloneDirRaw);
  return {
    databaseUrl: parsed.DATABASE_URL,
    redisUrl: parsed.REDIS_URL,
    apiPort: parsed.API_PORT,
    webPort: parsed.WEB_PORT,
    cloneDir,
    secretsPath: join(homedir(), '.devdigest', 'secrets.json'),
    nodeEnv: parsed.NODE_ENV,
    logLevel: parsed.LOG_LEVEL ?? (parsed.NODE_ENV === 'test' ? 'silent' : 'info'),
    webOrigin: `http://localhost:${parsed.WEB_PORT}`,
    embeddingsEnabled: parsed.EMBEDDINGS_ENABLED === 'true',
    repoIntelEnabled: parsed.REPO_INTEL_ENABLED !== 'false',
    contextRoots: parsed.CONTEXT_ROOTS.split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  };
}
```

## `server/src/platform/container.ts`

```ts
import type {
  AuthProvider,
  SecretsProvider,
  GitHubClient,
  GitClient,
  CodeIndex,
  Embedder,
  LLMProvider,
} from '@devdigest/shared';
import type { AppConfig } from './config.js';
import type { Db } from '../db/client.js';
import { JobRunner } from './jobs.js';
import { runBus, type RunBus } from './sse.js';
import { LocalSecretsProvider } from '../adapters/secrets/local.js';
import { LocalNoAuthProvider } from '../adapters/auth/local.js';
import { OctokitGitHubClient } from '../adapters/github/octokit.js';
import { SimpleGitClient } from '../adapters/git/simple-git.js';
import { RipgrepCodeIndex } from '../adapters/codeindex/ripgrep.js';
import { OpenAIProvider } from '../adapters/llm/openai.js';
import { AnthropicProvider } from '../adapters/llm/anthropic.js';
import { OpenAIEmbedder } from '../adapters/embedder/openai.js';
import { OpenRouterProvider } from '@devdigest/reviewer-core';
import { estimateCost } from '../adapters/llm/pricing.js';
import { PriceBook } from './price-book.js';
import { ConfigError } from './errors.js';
import { AgentsRepository } from '../modules/agents/repository.js';
import { ReviewRepository } from '../modules/reviews/repository.js';
import { SkillsRepository } from '../modules/skills/repository.js';
import { ContextRepository } from '../modules/context/repository.js';
import { RepoRepository } from '../modules/repos/repository.js';
import type { RepoIntel } from '../modules/repo-intel/types.js';
import { RepoIntelService } from '../modules/repo-intel/service.js';
import { type DepGraph, DepCruiseGraph } from '../adapters/depgraph/index.js';
import { type Tokenizer, TiktokenTokenizer } from '../adapters/tokenizer/index.js';
import { type Cache, NoopCache, RedisCache } from '../adapters/cache/index.js';

/**
 * DI container. One per app instance. Holds config, db, the JobRunner,
 * the SSE bus, and lazily-constructed adapters resolved through SecretsProvider.
 *
 * Tests construct a container with `overrides` to inject mock adapters; the
 * Services depend on these interfaces, not the concrete classes.
 */
export interface ContainerOverrides {
  secrets?: SecretsProvider;
  auth?: AuthProvider;
  github?: GitHubClient;
  git?: GitClient;
  codeIndex?: CodeIndex;
  embedder?: Embedder;
  /** Pre-built providers by id (skip key lookup). */
  llm?: Partial<Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>>;
  /** repo-intel facade (T1.1+) — tests inject mock RepoIntel implementations. */
  repoIntel?: RepoIntel;
  /** repo-intel T3 adapters — only the indexer pipeline reads these. */
  depgraph?: DepGraph;
  tokenizer?: Tokenizer;
  /** Key/value cache in front of hot GitHub reads; defaults to NoopCache. */
  cache?: Cache;
}

export class Container {
  readonly config: AppConfig;
  readonly db: Db;
  readonly secrets: SecretsProvider;
  readonly auth: AuthProvider;
  readonly jobs: JobRunner;
  readonly runBus: RunBus;

  private _git?: GitClient;
  private _github?: GitHubClient;
  private _codeIndex?: CodeIndex;
  private _embedder?: Embedder;
  private llmCache = new Map<string, LLMProvider>();

  // Shared repositories for cross-cutting entities (agents, reviews/pulls,
  // runs). Constructed here, in the composition root, so consuming modules use
  // `container.agentsRepo` instead of reaching into another module's folder.
  private _agentsRepo?: AgentsRepository;
  private _reviewRepo?: ReviewRepository;
  private _skillsRepo?: SkillsRepository;
  private _contextRepo?: ContextRepository;
  private _repoRepo?: RepoRepository;
  private _repoIntel?: RepoIntel;
  private _depgraph?: DepGraph;
  private _tokenizer?: Tokenizer;
  private _priceBook?: PriceBook;
  private _cache?: Cache;

  constructor(config: AppConfig, db: Db, private overrides: ContainerOverrides = {}) {
    this.config = config;
    this.db = db;
    this.secrets = overrides.secrets ?? new LocalSecretsProvider(config.secretsPath);
    this.auth = overrides.auth ?? new LocalNoAuthProvider(db);
    this.runBus = runBus;
    this.jobs = new JobRunner(db);
  }

  get git(): GitClient {
    if (this.overrides.git) return this.overrides.git;
    this._git ??= new SimpleGitClient(this.config.cloneDir);
    return this._git;
  }

  get agentsRepo(): AgentsRepository {
    return (this._agentsRepo ??= new AgentsRepository(this.db));
  }

  get reviewRepo(): ReviewRepository {
    return (this._reviewRepo ??= new ReviewRepository(this.db));
  }

  get skillsRepo(): SkillsRepository {
    return (this._skillsRepo ??= new SkillsRepository(this.db));
  }

  /** agent_context/skill_context link table access (paths-only attachments). */
  get contextRepo(): ContextRepository {
    return (this._contextRepo ??= new ContextRepository(this.db));
  }

  get repoRepo(): RepoRepository {
    return (this._repoRepo ??= new RepoRepository(this.db));
  }

  get codeIndex(): CodeIndex {
    if (this.overrides.codeIndex) return this.overrides.codeIndex;
    this._codeIndex ??= new RipgrepCodeIndex(this.git);
    return this._codeIndex;
  }

  /**
   * The repo-intel facade (T1.1). All higher-level features (reviews,
   * blast/onboarding migrations, phantom-gate) code against this interface.
   * Tests inject a mock via `ContainerOverrides.repoIntel`.
   */
  get repoIntel(): RepoIntel {
    if (this.overrides.repoIntel) return this.overrides.repoIntel;
    this._repoIntel ??= new RepoIntelService(this);
    return this._repoIntel;
  }

  /** Import-graph builder (dependency-cruiser). T3 indexer pipeline only. */
  get depgraph(): DepGraph {
    if (this.overrides.depgraph) return this.overrides.depgraph;
    this._depgraph ??= new DepCruiseGraph();
    return this._depgraph;
  }

  /** Token counter (js-tiktoken) for the repo-map budget search. */
  get tokenizer(): Tokenizer {
    if (this.overrides.tokenizer) return this.overrides.tokenizer;
    this._tokenizer ??= new TiktokenTokenizer();
    return this._tokenizer;
  }

  /**
   * Read-through cache for hot external reads (today: the GitHub PR detail
   * fetch — see modules/pulls/pr-detail-cache.ts). Redis when REDIS_URL is set,
   * otherwise a NoopCache: the cache is an optimisation, never a requirement, so
   * a Redis-less (or Redis-down) install still serves every request.
   */
  get cache(): Cache {
    if (this.overrides.cache) return this.overrides.cache;
    this._cache ??= this.config.redisUrl
      ? new RedisCache(this.config.redisUrl)
      : new NoopCache();
    return this._cache;
  }

  /**
   * Live OpenRouter pricing for cost attribution. The lister builds a bare
   * OpenRouter provider just for `/models` (no estimator needed) and degrades to
   * `[]` when no key is configured; the static `estimateCost` table is the
   * fallback for OpenAI/Anthropic and a cold/cold-failed cache.
   */
  get priceBook(): PriceBook {
    this._priceBook ??= new PriceBook(async () => {
      try {
        const key = await this.secrets.get('OPENROUTER_API_KEY');
        if (!key) return [];
        return await new OpenRouterProvider(key).listModels();
      } catch {
        return [];
      }
    }, estimateCost);
    return this._priceBook;
  }

  async github(): Promise<GitHubClient> {
    if (this.overrides.github) return this.overrides.github;
    if (this._github) return this._github;
    const token = await this.secrets.get('GITHUB_TOKEN');
    if (!token) throw new ConfigError('GITHUB_TOKEN is not configured');
    this._github = new OctokitGitHubClient(token);
    return this._github;
  }

  /** Resolve an LLM provider by id; constructs from the secret key, cached. */
  async llm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    const injected = this.overrides.llm?.[id];
    if (injected) return injected;
    const cached = this.llmCache.get(id);
    if (cached) return cached;
    const provider = await this.buildLlm(id);
    this.llmCache.set(id, provider);
    return provider;
  }

  private async buildLlm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    if (id === 'openai') {
      const key = await this.secrets.get('OPENAI_API_KEY');
      if (!key) throw new ConfigError('OPENAI_API_KEY is not configured');
      return new OpenAIProvider(key);
    }
    if (id === 'openrouter') {
      // Single OpenRouter provider lives in reviewer-core (shared with the CI
      // runner); inject the PriceBook so cost attribution uses LIVE OpenRouter
      // prices (with the static table as a fallback) rather than a hardcoded one.
      const key = await this.secrets.get('OPENROUTER_API_KEY');
      if (!key) throw new ConfigError('OPENROUTER_API_KEY is not configured');
      return new OpenRouterProvider(key, {
        estimateCost: (model, tokensIn, tokensOut) =>
          this.priceBook.estimate(model, tokensIn, tokensOut),
      });
    }
    const key = await this.secrets.get('ANTHROPIC_API_KEY');
    if (!key) throw new ConfigError('ANTHROPIC_API_KEY is not configured');
    return new AnthropicProvider(key);
  }

  async embedder(): Promise<Embedder> {
    // Injected embedders (tests) always win. Otherwise embeddings are gated by
    // config: when disabled we throw BEFORE constructing the OpenAI client, so
    // the app makes ZERO OpenAI requests. All callers wrap this in try/catch and
    // degrade gracefully (memory/RAG simply returns no hits).
    if (this.overrides.embedder) return this.overrides.embedder;
    if (!this.config.embeddingsEnabled) {
      throw new ConfigError('Embeddings are disabled (set EMBEDDINGS_ENABLED=true to enable memory/RAG)');
    }
    if (this._embedder) return this._embedder;
    const openai = await this.llm('openai');
    this._embedder = new OpenAIEmbedder(openai);
    return this._embedder;
  }

  /**
   * Drop cached provider clients so the next resolve picks up changed secrets.
   * Call after persisting a new API key/PAT via SecretsProvider.set.
   */
  invalidateSecretCaches(): void {
    this.llmCache.clear();
    this._github = undefined;
    this._embedder = undefined;
  }
}
```
