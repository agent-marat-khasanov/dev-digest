# Proposal — Redis cache in front of the GitHub PR reads

## What is actually being re-fetched

`GET /pulls/:id` (`server/src/modules/pulls/routes.ts:228`) calls
`GitHubClient.getPullRequest`, which in the Octokit adapter is **up to four REST calls**:
`pulls.get` + `pulls.listFiles` (the whole file list, `per_page: 100`) + `pulls.listCommits` +
the linked-issue `issues.get` (`server/src/adapters/github/octokit.ts:70`). The client hits this
endpoint every time a PR is opened, i.e. on every review re-run — that is the quota burn.

Nothing else re-reads the file list: the review pipeline works off the persisted `pr_files`
(`server/src/modules/reviews/diff-loader.ts`), and `listPullRequests` is one call that is also what
keeps `pull_requests.head_sha` fresh — so both are left alone. The cache goes exactly on
`getPullRequest`, keyed by repo + PR number + head sha, TTL 15 minutes.

## Files

| repo-relative path | new / modified | what goes in it and why it belongs there |
|---|---|---|
| `server/src/adapters/cache/index.ts` | new | The `Cache` port (`get(key)` / `set(key, value, ttlSeconds)`) plus `NoopCache`. Server-internal infrastructure, so the port sits next to its implementations in `adapters/` — the same shape as the existing `DepGraph` (`adapters/depgraph/index.ts`) and `Tokenizer` (`adapters/tokenizer/index.ts`) ports. It deliberately does **not** go in `vendor/shared` (do-not-touch; that file holds contracts shared with `client/`, `mcp/` and `reviewer-core/`, none of which have any business knowing about our cache). |
| `server/src/adapters/cache/redis.ts` | new | `RedisCache` — the ioredis implementation. Lives beside its port exactly like `adapters/github/octokit.ts` lives beside the `GitHubClient` port. Fails fast and quiet (lazy connect, 1s command timeout, 1 retry, mandatory `error` listener) and swallows its own errors, because a cache outage must degrade to "no cache", never to a 500. |
| `server/src/adapters/index.ts` | modified | Adapter barrel — one line exporting `Cache` / `NoopCache` / `RedisCache`, consistent with every other adapter. |
| `server/src/platform/config.ts` | modified | `REDIS_URL` in the zod `EnvSchema` (optional, `''` → undefined) and `redisUrl: string \| undefined` on `AppConfig`. Env parsing happens in exactly one place in this codebase; it holds a connection string like `DATABASE_URL`, not a secret, so it belongs here and not behind `SecretsProvider` (which the file's own header reserves for API keys). |
| `server/src/platform/container.ts` | modified | `ContainerOverrides.cache` + a lazy `get cache(): Cache` that returns `RedisCache` when `config.redisUrl` is set and `NoopCache` otherwise. The container is the only place allowed to pick a concrete adapter; the override slot is how tests inject a fake, same as `depgraph`/`tokenizer`. |
| `server/src/modules/pulls/pr-detail-cache.ts` | new | The read-through logic: the key format (`gh:pr-detail:{owner}/{name}:{n}:{headSha}`), the 15-minute TTL, JSON encode/decode with a `PrDetail.parse` re-validation of anything read back out of Redis. A module-level helper taking `(container, …)` — the same shape as `modules/reviews/diff-loader.ts`. It lives in `pulls/` because the caching *policy* (which sha, how long) is a feature decision; the adapter stays a dumb key/value store, and the Octokit client stays a thin, unconditional GitHub client. |
| `server/src/modules/pulls/routes.ts` | modified | The `GET /pulls/:id` handler calls `getPrDetail(container, gh, repo, pr.number, pr.headSha)` instead of `gh.getPullRequest(...)`. That handler is the one place that already has the head sha in hand (`pull_requests.head_sha`, from the PR-list sync). Everything else in the route — the persistence of `pr_files`/`pr_commits` and the offline fallback — is untouched. |
| `server/package.json` | modified | `ioredis@^5.4.1` dependency. |
| `server/.env.example` | modified | Documents `REDIS_URL`, and that it is optional. |
| `docker-compose.yml` | modified | A `redis:7-alpine` service so `./scripts/dev.sh` (`docker compose up -d`) gives a local Redis at the URL the example env points at. No volume: every value in it is a 15-minute copy of data that can be re-fetched. |

## How the pieces call each other at run time

`loadConfig()` parses `REDIS_URL` into `AppConfig.redisUrl`; `buildApp` passes the config to the
`Container`, whose lazy `cache` getter constructs a `RedisCache` (or a `NoopCache` when the URL is
absent) the first time anything asks for it. A request to `GET /pulls/:id` loads the `pull_requests`
row (which carries `head_sha`), resolves the `GitHubClient` from the container as it does today, and
hands both to `getPrDetail`. That helper builds the key `gh:pr-detail:{owner}/{name}:{n}:{sha}` and
asks `container.cache` for it: on a hit it JSON-parses the value and re-validates it with the
`PrDetail` zod contract (a corrupt or older-shape entry is treated as a miss), and returns it without
touching GitHub. On a miss it calls `gh.getPullRequest(...)` exactly as before, writes the serialized
result back under that key with `EX 900`, and returns it. The route then persists files/commits and
responds unchanged, so behaviour is identical to today — just without the four REST calls on the
second and subsequent reviews of the same PR.

Invalidation is structural rather than manual: a new push changes the PR's head sha, the PR-list
sync writes that sha to `pull_requests.head_sha`, the next detail read therefore computes a *different*
key, and the stale entry is simply never read again (it expires on its own). The 15-minute TTL is
what bounds the fields that can change *without* a push (title, body, status) and the window before
the list sync notices a new head. Every failure path — Redis down, Redis absent, garbage in the key —
falls through to the live GitHub call, so the cache can never be the reason a request fails.
