# Redis cache in front of the GitHub PR reads

## What is actually being re-fetched

Re-running a review re-reads the PR through `GitHubClient.getPullRequest(repo, n)`
(`server/src/vendor/shared/adapters.ts:145`). One call to `OctokitGitHubClient.getPullRequest`
(`server/src/adapters/github/octokit.ts:70`) makes **~4 REST calls**: `pulls.get` +
`pulls.listFiles` (the whole changed-file list, with patches) + `pulls.listCommits` +
the linked-issue lookup. It is hit by `GET /pulls/:id` on every PR open / review re-run
(`server/src/modules/pulls/routes.ts:229`, and the backfill loop at `:96`). That is the read to cache.

## Files

| repo-relative path | new / modified | what goes in it and why it belongs there |
|---|---|---|
| `server/src/adapters/cache/index.ts` | **new** | The `Cache` **port** (`get`/`set(ttl)`/`close`, opaque string values) **and** its `RedisCache` implementation (ioredis). Port + adapter live together because the port is **server-local** — nothing outside `server/` names `Cache`, so it must NOT go into `vendor/shared` (that module is hand-synced into `client/` and imported by `reviewer-core`). This is exactly the `Tokenizer` precedent (`adapters/tokenizer/index.ts`). Contract: a dead Redis degrades to a miss, never throws. |
| `server/src/adapters/github/cached.ts` | **new** | `CachedGitHubClient implements GitHubClient` — a **decorator** over another `GitHubClient` that caches `getPullRequest` (15-min TTL, key = repo + PR + head sha) and passes every other method straight through. Caching is infrastructure, so it lives on the infrastructure ring next to the GitHub I/O it accelerates; because it implements the same port, *no service, route, or contract changes at all*. |
| `server/src/adapters/mocks.ts` | modified | Adds `MockCache implements Cache` (in-memory `Map`, TTL recorded not enforced) so tests swap Redis out via `ContainerOverrides.cache`, exactly like every other port. Adds a `detailFetches` counter to `MockGitHubClient` so a test can assert "second read hit the cache, not GitHub". |
| `server/src/platform/container.ts` | modified | Composition root, the **only** place that knows the concretes: new `cache` getter (`overrides.cache ?? (config.redisUrl ? new RedisCache(url) : undefined)`), new `ContainerOverrides.cache`, and `github()` now returns `new CachedGitHubClient(new OctokitGitHubClient(token), cache)` when a cache exists and the bare Octokit client when it does not. Plus `close()` to release the Redis socket. |
| `server/src/platform/config.ts` | modified | `REDIS_URL` added to the zod `EnvSchema` and to `AppConfig.redisUrl?`. A connection string, not a BYO API key — same class of value as `DATABASE_URL` — so it belongs in `AppConfig`, not `SecretsProvider` (whose comment in this file explicitly reserves itself for secret keys). Optional: unset ⇒ caching off. |
| `server/src/app.ts` | modified | Two lines: `app.addHook('onClose', () => container.close())` so the Redis connection is released with the app (mirrors the existing db-handle hook). |
| `server/src/adapters/index.ts` | modified | Barrel: export `Cache` / `RedisCache` / `CachedGitHubClient` alongside the other adapters. |
| `server/package.json` | modified | Adds `ioredis ^5.4.1` (no Redis client existed). Needs `pnpm install` in `server/` — not run here. |
| `server/.env.example` | modified | Documents `REDIS_URL=redis://localhost:6379` and that leaving it empty means "run uncached". |
| `docker-compose.yml` | modified | Adds an ephemeral `redis:7-alpine` service (no volume, `allkeys-lru`) next to Postgres, so `./scripts/dev.sh` gives you the Redis the default `REDIS_URL` points at. |

## How the pieces call each other at run time

`GET /pulls/:id` (presentation) asks the container for the `GitHubClient` port, as it always has.
The container (composition root) resolves the `GITHUB_TOKEN`, builds `OctokitGitHubClient`, and — if
`config.redisUrl` is set — wraps it in `CachedGitHubClient(octokit, container.cache)`, where
`container.cache` is a `RedisCache` built from `REDIS_URL`. The route calls `gh.getPullRequest(repo, n)`
and cannot tell which of the two it is holding. Inside the decorator the lookup is two Redis reads: a
**head pointer** `devdigest:gh:pr:v1:<owner>/<name>:<n>:head → <sha>`, then the **detail** entry
`…:<n>:<sha> → PrDetail JSON`, re-validated with the `PrDetail` zod contract; on a hit GitHub is not
touched at all, on a miss the inner Octokit client is called and both keys are written with a 900-second
TTL. Any Redis error inside `RedisCache` is swallowed into a miss, so a Redis outage costs a slow request,
never a failed one — and with no `REDIS_URL` the app is byte-for-byte the old behavior.

**Why the extra head-pointer key.** The requirement is "keyed by repo + PR + head sha", but the port's
signature is `getPullRequest(repo, n)` — the caller does not pass a sha, and I did not want to add a
cache-key argument to a *domain port* just to serve an infrastructure concern (that would leak caching
inward, breaking the dependency rule). So the decorator remembers the sha itself: the detail entry is
content-addressed by the sha it was fetched at (a cached file list can therefore never be served for a
different commit), and the pointer says which sha is current. `listPullRequests` — the PR-list sync the UI
and `POST /repos/:id/poll` already run before any PR read — returns each PR's current `head_sha`, so the
decorator refreshes the pointers from it **for free**: a new commit moves the pointer, the sha-keyed detail
misses, and GitHub is re-read at once rather than after the TTL. Absent a list sync, staleness is bounded
by the 15-minute TTL, which is what a TTL cache means.

**Flagged uncertainty / out of scope.** I cached only `getPullRequest`; `listPullRequests`,
`listReviewComments` and `getIssue` still go straight to GitHub (the task named the file-list re-fetch,
and the comments tab is deliberately live). `commitFiles`/`postReview` do not touch the reviewed PR's
head, so no write-invalidation is wired — if that ever becomes false, the fix is a `cache.set(headKey, …)`
in the decorator, not a change anywhere inward.
