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

  # Cache for GitHub reads (15-min TTL). Ephemeral by design — no volume: the
  # cache may be lost at any time, every entry is re-fetchable from GitHub.
  redis:
    image: redis:7-alpine
    container_name: devdigest-redis
    restart: unless-stopped
    command: ["redis-server", "--save", "", "--appendonly", "no", "--maxmemory-policy", "allkeys-lru"]
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

# Redis — read-through cache in front of GitHub reads (PR detail + changed-file
# list), 15-minute TTL keyed by repo + PR + head sha. OPTIONAL: leave empty and
# the app runs uncached (every review re-fetches from GitHub). `docker-compose up`
# starts a Redis on 6379.
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
 * cache adapter — TTL key/value cache placed in front of expensive external reads.
 *
 * PORT + ADAPTER LIVE TOGETHER because the port is SERVER-LOCAL: nothing outside
 * `server/` names `Cache` (only the composition root and the adapters it wires
 * do), so it does NOT belong in `vendor/shared` — that module is hand-synced into
 * `client/` and imported by `reviewer-core`, and parking a server-only port there
 * widens a shared surface for nothing. Same call as `Tokenizer`
 * (adapters/tokenizer/index.ts). It is still a port: resolved from the Container
 * and swappable via `ContainerOverrides.cache`.
 *
 * CONTRACT: the cache is a best-effort accelerator, never a source of truth.
 * An unreachable/wedged Redis MUST degrade to a cache miss, never fail the
 * caller — so `get`/`set` swallow transport errors instead of throwing.
 *
 * Values are opaque strings: serialization (and re-validating what comes back)
 * is the caller's job, which keeps this port a dumb KV store with no knowledge
 * of GitHub, PRs, or any other domain shape.
 */
import Redis from 'ioredis';

export interface Cache {
  /** The value, or null on a miss OR any cache failure. */
  get(key: string): Promise<string | null>;
  /** Store with an expiry. Failures are swallowed — a lost write is just a later miss. */
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Release the connection (called from the Container on app shutdown). */
  close(): Promise<void>;
}

export class RedisCache implements Cache {
  private readonly client: Redis;

  constructor(url: string) {
    this.client = new Redis(url, {
      // No socket is opened until the first get/set — an app that never touches
      // GitHub never connects.
      lazyConnect: true,
      // A wedged Redis must not stall an API request: fail fast, then miss.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    // ioredis emits 'error' on every failed (re)connect; with no listener Node
    // turns that into an unhandled error event and kills the process. Degrading
    // to a miss is the whole point of this adapter, so absorb them here.
    this.client.on('error', () => {});
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } catch {
      /* fire-and-forget: a failed write only costs a future miss */
    }
  }

  async close(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
```

## `server/src/adapters/github/cached.ts`

```ts
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
export { CachedGitHubClient } from './github/cached.js';
export { SimpleGitClient } from './git/simple-git.js';
export { parseUnifiedDiff } from './git/diff-parser.js';
export { RipgrepCodeIndex } from './codeindex/ripgrep.js';
export { type Cache, RedisCache } from './cache/index.js';
export { estimateCost } from './llm/pricing.js';
export * from './mocks.js';
```

## `server/src/adapters/mocks.ts`

```ts
import type { z } from 'zod';
import type {
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
  Embedder,
  GitHubClient,
  RepoRef,
  PrMeta,
  PrDetail,
  GitHubReviewPayload,
  CreateReviewCommentInput,
  PrReviewComment,
  OpenPrPayload,
  CommitFilesPayload,
  IssueMeta,
  GitClient,
  CloneOptions,
  UnifiedDiff,
  BlameLine,
  GitCommit,
  CodeIndex,
  CodeMatch,
  CodeSymbol,
  CodeReference,
  AuthProvider,
  AuthUser,
  AuthWorkspace,
  SecretsProvider,
  SecretKey,
} from '@devdigest/shared';
import type { Cache } from './cache/index.js';
import { parseUnifiedDiff } from './git/diff-parser.js';

/**
 * Deterministic MOCK adapters for tests/dev — NO real network. Each mirrors the
 * adapter interface. The mock LLM returns a caller-supplied fixture (or a default)
 * for completeStructured, so review/grounding flows can be tested end-to-end.
 */

// ---------- Mock LLM ----------
export interface MockLLMOptions {
  models?: ModelInfo[];
  /** Fixture returned by completeStructured (validated against the schema). */
  structured?: unknown;
  /**
   * Per-schemaName fixtures for multi-call flows (e.g. the conventions 2-step
   * dialogue: 'ConventionFileSelection' then 'ConventionExtraction'). Looked up
   * by req.schemaName; falls back to `structured` when no entry matches.
   */
  structuredBySchema?: Record<string, unknown>;
  completionText?: string;
  embedding?: number[];
}

export class MockLLMProvider implements LLMProvider {
  readonly id: 'openai' | 'anthropic';
  public calls: { method: string; req: unknown }[] = [];

  constructor(
    id: 'openai' | 'anthropic' = 'openai',
    private opts: MockLLMOptions = {},
  ) {
    this.id = id;
  }

  async listModels(): Promise<ModelInfo[]> {
    this.calls.push({ method: 'listModels', req: null });
    return (
      this.opts.models ?? [
        { id: 'gpt-4.1', provider: this.id === 'anthropic' ? 'anthropic' : 'openai' },
      ]
    );
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.calls.push({ method: 'complete', req });
    return {
      text: this.opts.completionText ?? 'mock completion',
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
    };
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    const fixture = this.opts.structuredBySchema?.[req.schemaName] ?? this.opts.structured ?? {};
    const parsed = (req.schema as z.ZodType<T>).safeParse(fixture);
    if (!parsed.success) {
      throw new Error(`MockLLMProvider fixture failed schema: ${parsed.error.message}`);
    }
    return {
      data: parsed.data,
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
      raw: JSON.stringify(fixture),
      attempts: 1,
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    this.calls.push({ method: 'embed', req: texts });
    return texts.map(() => this.opts.embedding ?? new Array(1536).fill(0));
  }
}

// ---------- Mock Embedder ----------
export class MockEmbedder implements Embedder {
  readonly dims = 1536;
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((_, i) => new Array(1536).fill(0).map((_, j) => (i + j) % 2));
  }
}

// ---------- Mock GitHub ----------
export interface MockGitHubOptions {
  pulls?: PrMeta[];
  detail?: Partial<PrDetail>;
  login?: string;
  /** Existing inline review comments returned by listReviewComments. */
  comments?: PrReviewComment[];
}

export class MockGitHubClient implements GitHubClient {
  public posted: { n: number; review: GitHubReviewPayload }[] = [];
  public openedPrs: OpenPrPayload[] = [];
  public committed: CommitFilesPayload[] = [];
  public createdComments: CreateReviewCommentInput[] = [];
  /** How many times GitHub was actually hit for PR detail (cache-hit assertions). */
  public detailFetches = 0;

  constructor(private opts: MockGitHubOptions = {}) {}

  async listPullRequests(_repo: RepoRef): Promise<PrMeta[]> {
    return (
      this.opts.pulls ?? [
        {
          number: 482,
          title: 'Add rate limiting to public API endpoints',
          author: 'marisa.koch',
          branch: 'feat/rate-limit-public',
          base: 'main',
          head_sha: 'a1b2c3d4',
          additions: 247,
          deletions: 38,
          files_count: 9,
          status: 'open',
          opened_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T03:00:00Z',
        },
      ]
    );
  }

  async getPullRequest(_repo: RepoRef, n: number): Promise<PrDetail> {
    this.detailFetches++;
    const base: PrDetail = {
      number: n,
      title: 'Add rate limiting to public API endpoints',
      author: 'marisa.koch',
      branch: 'feat/rate-limit-public',
      base: 'main',
      head_sha: 'a1b2c3d4',
      additions: 247,
      deletions: 38,
      files_count: 9,
      status: 'open',
      body: 'Add rate limiting. Closes #471.',
      files: [
        {
          path: 'src/config.ts',
          additions: 4,
          deletions: 0,
          patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
        },
      ],
      commits: [
        { sha: 'a1b2c3d4', message: 'Add limiter', author: 'marisa.koch', committed_at: null },
      ],
      linked_issue: null,
    };
    return { ...base, ...this.opts.detail };
  }

  async postReview(_repo: RepoRef, n: number, review: GitHubReviewPayload): Promise<{ id: string }> {
    this.posted.push({ n, review });
    return { id: `mock-review-${n}` };
  }

  async listReviewComments(_repo: RepoRef, _n: number): Promise<PrReviewComment[]> {
    return this.opts.comments ?? [];
  }

  async createReviewComment(
    _repo: RepoRef,
    _n: number,
    input: CreateReviewCommentInput,
  ): Promise<PrReviewComment> {
    this.createdComments.push(input);
    return {
      id: this.createdComments.length,
      path: input.path,
      line: input.line,
      original_line: input.line,
      side: input.side ?? 'RIGHT',
      body: input.body,
      user: this.opts.login ?? 'mock-user',
      created_at: '2026-06-01T00:00:00Z',
      html_url: `https://github.com/mock/mock/pull/1#discussion_r${this.createdComments.length}`,
      in_reply_to_id: input.inReplyTo ?? null,
      is_outdated: false,
    };
  }

  async openPullRequest(_repo: RepoRef, payload: OpenPrPayload): Promise<{ url: string }> {
    this.openedPrs.push(payload);
    return { url: 'https://github.com/mock/mock/pull/1' };
  }

  async commitFiles(_repo: RepoRef, payload: CommitFilesPayload): Promise<{ branch: string }> {
    this.committed.push(payload);
    return { branch: payload.branch };
  }

  async findOpenPr(_repo: RepoRef, branch: string): Promise<{ url: string } | null> {
    const pr = this.openedPrs.find((p) => p.head === branch);
    return pr ? { url: 'https://github.com/mock/mock/pull/1' } : null;
  }

  async getIssue(_repo: RepoRef, n: number): Promise<IssueMeta> {
    return { number: n, title: `Issue #${n}`, body: 'mock issue', state: 'open' };
  }

  async currentLogin(): Promise<string> {
    return this.opts.login ?? 'mock-user';
  }
}

// ---------- Mock Cache ----------
/**
 * In-memory Cache — no Redis. TTLs are RECORDED, not enforced (tests assert the
 * key/TTL that was written rather than waiting 15 minutes).
 */
export class MockCache implements Cache {
  public readonly store = new Map<string, { value: string; ttlSeconds: number }>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, ttlSeconds });
  }

  async close(): Promise<void> {}
}

// ---------- Mock Git ----------
export interface MockGitOptions {
  diff?: string;
  files?: Record<string, string>;
  /** Name-only diff result (drives the incremental indexer's "changed files since X" path). */
  diffNameOnly?: string[];
  /** Override `currentHead()` so tests can simulate "sha unchanged since last index". */
  head?: string;
  /** Head `currentHead()` returns AFTER `sync()` runs — simulates fetch+reset advancing HEAD. */
  syncedHead?: string;
}

export class MockGitClient implements GitClient {
  public cloned: { repo: RepoRef; url: string }[] = [];
  public syncs: { repo: RepoRef; branch: string }[] = [];
  private syncedHead?: string;

  constructor(private opts: MockGitOptions = {}) {}

  clonePathFor(repo: RepoRef): string {
    return `/mock/clones/${repo.owner}/${repo.name}`;
  }
  async clone(repo: RepoRef, url: string, _opts?: CloneOptions): Promise<{ path: string }> {
    this.cloned.push({ repo, url });
    return { path: this.clonePathFor(repo) };
  }
  async fetchPullHead(): Promise<void> {}
  async sync(repo: RepoRef, branch: string): Promise<{ head: string }> {
    this.syncs.push({ repo, branch });
    // After a sync, HEAD advances to syncedHead (or stays at head if unset).
    this.syncedHead = this.opts.syncedHead ?? this.opts.head ?? 'a1b2c3d4';
    return { head: this.syncedHead };
  }
  async currentHead(): Promise<string> {
    return this.syncedHead ?? this.opts.head ?? 'a1b2c3d4';
  }
  async diffNameOnly(): Promise<string[]> {
    return this.opts.diffNameOnly ?? [];
  }
  async diff(): Promise<UnifiedDiff> {
    const raw =
      this.opts.diff ??
      'diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';
    return parseUnifiedDiff(raw);
  }
  async blame(): Promise<BlameLine[]> {
    return [{ line: 1, sha: 'a1b2c3d4', author: 'marisa.koch', date: '2026-06-01', summary: 'init' }];
  }
  async log(): Promise<GitCommit[]> {
    return [{ sha: 'a1b2c3d4', message: 'init', author: 'marisa.koch', date: '2026-06-01' }];
  }
  async readFile(_repo: RepoRef, path: string): Promise<string> {
    return this.opts.files?.[path] ?? '';
  }
}

// ---------- Mock CodeIndex ----------
export class MockCodeIndex implements CodeIndex {
  async grep(_repo: RepoRef, pattern: string): Promise<CodeMatch[]> {
    return [{ path: 'src/config.ts', line: 12, text: `match for ${pattern}` }];
  }
  async symbols(): Promise<CodeSymbol[]> {
    return [{ path: 'src/middleware/ratelimit.ts', name: 'rateLimit', kind: 'function', line: 25 }];
  }
  async references(_repo: RepoRef, symbol: string): Promise<CodeReference[]> {
    return [{ fromPath: 'src/api/public/index.ts', toSymbol: symbol, line: 23 }];
  }
}

// ---------- Mock Auth / Secrets ----------
export class MockAuthProvider implements AuthProvider {
  constructor(
    private user: AuthUser = { id: 'u1', email: 'you@local', name: 'You' },
    private workspace: AuthWorkspace = { id: 'w1', name: 'default' },
  ) {}
  async currentUser(): Promise<AuthUser> {
    return this.user;
  }
  async currentWorkspace(): Promise<AuthWorkspace> {
    return this.workspace;
  }
}

export class MockSecretsProvider implements SecretsProvider {
  constructor(private secrets: Partial<Record<string, string>> = {}) {}
  async get(key: SecretKey): Promise<string | undefined> {
    return this.secrets[key as string];
  }
}
```

## `server/src/app.ts`

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { FastifySSEPlugin } from 'fastify-sse-v2';
import {
  validatorCompiler,
  serializerCompiler,
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { loadConfig, type AppConfig } from './platform/config.js';
import { createDb, type Db } from './db/client.js';
import { Container, type ContainerOverrides } from './platform/container.js';
import { AppError } from './platform/errors.js';
import { modules } from './modules/index.js';
import { ReviewService } from './modules/reviews/service.js';

// Attach the DI container to every request/instance.
declare module 'fastify' {
  interface FastifyInstance {
    container: Container;
  }
}

export interface BuildAppOptions {
  config?: AppConfig;
  db?: Db;
  overrides?: ContainerOverrides;
}

/**
 * buildApp() — exported so tests can use `app.inject()` without a real port.
 * Wires the zod type provider (request validation + response serialization),
 * the security/transport plugins (helmet, cors, rate-limit, SSE) ahead of the
 * DI container and the statically-registered feature modules, plus a structured
 * error handler returning the ApiErrorBody envelope.
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = opts.config ?? loadConfig();
  const handle = opts.db ? null : createDb(config.databaseUrl);
  const db = opts.db ?? handle!.db;

  const app = Fastify({
    // Explicit 1MB cap on request bodies (PR comments, settings payloads are
    // small). Protects against oversized/abusive payloads.
    bodyLimit: 1_048_576,
    logger:
      config.logLevel === 'silent'
        ? false
        : {
            level: config.logLevel,
            transport:
              config.nodeEnv === 'development'
                ? { target: 'pino-pretty', options: { colorize: true } }
                : undefined,
          },
  });

  // Use zod schemas directly for request validation + response serialization.
  // Routes opt in per-module via `app.withTypeProvider<ZodTypeProvider>()`.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const container = new Container(config, db, opts.overrides);
  app.decorate('container', container);

  // Reap runs left 'running' by a previous (now-dead) process — otherwise they
  // show as perpetually "running" in the UI and can't be cancelled (no runner).
  //
  // AWAITED before the server accepts requests: a fresh process has no in-flight
  // runs of its own yet (runs only start via POST /review once listening), so
  // every 'running' row here is genuinely orphaned. Awaiting also closes the
  // race where a brand-new run could be created (and wrongly reaped) in the gap
  // between listening and an async reaper finishing.
  // NOTE: assumes a SINGLE API instance per DB. With multiple replicas this
  // would need per-instance scoping / heartbeats (not this app's deployment).
  try {
    const reaped = await new ReviewService(container).reapStaleRuns();
    if (reaped > 0) app.log.info({ reaped }, 'reaped stale running agent_runs on boot');
  } catch (err) {
    app.log.warn({ err: (err as Error).message }, 'stale-run reaping failed (non-fatal)');
  }

  // Security headers (X-Content-Type-Options, X-Frame-Options, …). The API
  // serves JSON only, so the default CSP is fine.
  await app.register(helmet);
  await app.register(cors, { origin: [config.webOrigin], credentials: true });
  await app.register(FastifySSEPlugin);

  // Global rate limit. Disabled under test so integration suites can hammer
  // endpoints via inject(); per-route overrides live on the routes themselves.
  if (config.nodeEnv !== 'test') {
    await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  }

  // Liveness check (no module, no DB, no rate limit).
  app.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));

  // Readiness check — verifies the DB is reachable with a cheap `SELECT 1`.
  // 503 (not 500) so orchestrators treat it as "not ready yet", not a crash.
  app.get('/health/ready', { config: { rateLimit: false } }, async (_req, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { ready: true };
    } catch (err) {
      app.log.warn({ err: (err as Error).message }, 'readiness check failed: db unreachable');
      return reply.status(503).send({ ready: false });
    }
  });

  // Structured error handler. Registered BEFORE modules so encapsulated
  // module plugins inherit it. Validation → 422; AppError → its status.
  app.setErrorHandler((err: unknown, _req, reply) => {
    // Request validation failure from the zod type provider (schema.body/params).
    if (hasZodFastifySchemaValidationErrors(err)) {
      reply.status(422).send({
        error: {
          code: 'validation_error',
          message: 'Request validation failed',
          details: err.validation,
        },
      });
      return;
    }
    // Response failed its own serialization schema — never leak the raw object;
    // log it and return a generic 500.
    if (isResponseSerializationError(err)) {
      app.log.error({ err }, 'response serialization failed');
      reply.status(500).send({ error: { code: 'internal_error', message: 'Internal error' } });
      return;
    }
    // Robust ZodError detection: `instanceof` can fail across duplicate zod
    // module instances (shared vs api), so also match by shape. Still needed for
    // service-level `.parse` calls and routes not yet on schema.body.
    const maybeZod = err as { name?: string; issues?: unknown; errors?: unknown };
    const isZodError =
      err instanceof z.ZodError ||
      (maybeZod?.name === 'ZodError' &&
        (Array.isArray(maybeZod.issues) || Array.isArray(maybeZod.errors)));
    if (isZodError) {
      reply.status(422).send({
        error: {
          code: 'validation_error',
          message: 'Request validation failed',
          details: maybeZod.issues ?? maybeZod.errors,
        },
      });
      return;
    }
    if (err instanceof AppError) {
      reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, details: err.details },
      });
      return;
    }
    app.log.error(err);
    const e = err as { statusCode?: number; message?: string };
    reply.status(e.statusCode ?? 500).send({
      error: { code: 'internal_error', message: e.message ?? 'Internal error' },
    });
  });

  // Register feature modules from the static registry (src/modules/index.ts).
  // Each module is a Fastify plugin in modules/<name>/routes.ts.
  for (const plugin of Object.values(modules)) {
    await app.register(plugin);
  }

  // Release connections held by container-built adapters (the Redis cache), then
  // close the db handle we created.
  app.addHook('onClose', async () => container.close());
  if (handle) app.addHook('onClose', async () => handle.close());

  return app;
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
  // Redis connection string for the read-through cache in front of GitHub reads
  // (adapters/cache + adapters/github/cached.ts). An infrastructure endpoint like
  // DATABASE_URL — not a BYO API key — so it belongs in AppConfig, not the
  // SecretsProvider. OPTIONAL: with no REDIS_URL the app runs uncached (every
  // GitHub read goes straight to GitHub), same local-first degradation as a
  // missing GITHUB_TOKEN.
  REDIS_URL: z.string().url().optional(),
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
  /**
   * Redis connection string for the GitHub read cache (e.g.
   * redis://localhost:6379). Undefined → caching is off, reads hit GitHub.
   */
  redisUrl?: string;
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
import { CachedGitHubClient } from '../adapters/github/cached.js';
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
import { type Cache, RedisCache } from '../adapters/cache/index.js';

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
  /** TTL cache behind the GitHub read cache — tests inject MockCache (no Redis). */
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
   * TTL cache for expensive external reads (today: the GitHub PR detail / file
   * list). OPTIONAL infrastructure — with no REDIS_URL configured this is
   * `undefined` and `github()` hands out the bare Octokit client, i.e. the app
   * behaves exactly as before, uncached. Same local-first degradation as a
   * missing GITHUB_TOKEN or disabled embeddings.
   */
  get cache(): Cache | undefined {
    if (this.overrides.cache) return this.overrides.cache;
    if (!this.config.redisUrl) return undefined;
    this._cache ??= new RedisCache(this.config.redisUrl);
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

  /**
   * GitHubClient port. When a cache is configured the real Octokit client is
   * wrapped in `CachedGitHubClient` — a decorator over the SAME port, so every
   * caller (services, routes) is unchanged and unaware. Composition of the two
   * happens HERE and only here.
   */
  async github(): Promise<GitHubClient> {
    if (this.overrides.github) return this.overrides.github;
    if (this._github) return this._github;
    const token = await this.secrets.get('GITHUB_TOKEN');
    if (!token) throw new ConfigError('GITHUB_TOKEN is not configured');
    const octokit = new OctokitGitHubClient(token);
    const cache = this.cache;
    this._github = cache ? new CachedGitHubClient(octokit, cache) : octokit;
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

  /**
   * Release long-lived connections held by adapters the container BUILT (an
   * injected override is owned by whoever injected it). Wired to Fastify's
   * onClose in app.ts.
   */
  async close(): Promise<void> {
    await this._cache?.close();
  }
}
```
