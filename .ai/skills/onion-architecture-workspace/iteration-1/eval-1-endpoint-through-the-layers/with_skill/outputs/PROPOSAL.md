# GET /repos/:repoId/stats — 30-day review activity rollup

One vertical slice through the rings: **route (presentation) → service (application) → repository (infrastructure)**,
with the wire shape declared as a Zod contract in the **domain** and pure mapping in `helpers.ts`.

## Files

| repo-relative path | new/modified | what goes in it and why it belongs there |
|---|---|---|
| `server/src/vendor/shared/contracts/repo-stats.ts` | **new** | Domain (innermost ring): the `RepoStats` Zod contract — `repo_id`, `window_days`, `since`, `runs`, `findings_total`, `findings_by_severity{CRITICAL,WARNING,SUGGESTION}`. Wire shapes are contracts, not DB rows, and contracts live in `vendor/shared/contracts/*`. A **new file** rather than an edit to `platform.ts`/`observability.ts` — the barrel's own rule is "extend with new files, don't edit existing ones" (`server/src/vendor/shared/index.ts:14`). Imports only Zod. |
| `server/src/vendor/shared/index.ts` | modified | Barrel: one `export * from './contracts/repo-stats.js'` line (+ the header index entry) so every package reaches it via `@devdigest/shared`. |
| `server/src/modules/reviews/repository/run.repo.ts` | modified | Infrastructure: the SQL. New `repoRunStatsSince(db, workspaceId, repoId, since)` → `{ runs, findingsBySeverity[] }`. Two grouped Drizzle counts: `agent_runs ⋈ pull_requests` for the run count, and `findings ⋈ reviews ⋈ agent_runs ⋈ pull_requests` grouped by `findings.severity`. It lives in the **reviews** module because `agent_runs`/`reviews`/`findings` are the review domain's tables and this file is already the only place that aggregates run findings by severity (`listRunsForPull`). It returns raw counts, not the DTO — mapping happens at the boundary. |
| `server/src/modules/reviews/repository.ts` | modified | Infrastructure façade: exposes `ReviewRepository.repoRunStatsSince(...)` (+ re-exports the `RepoRunStats` type). `ReviewRepository` is already shared through the composition root as `container.reviewRepo`, so this is the sanctioned seam for a sibling module to read review data instead of reaching into another module's folder or querying `findings` from the repos repository. |
| `server/src/modules/repos/constants.ts` | modified | Literals out of the logic: `STATS_WINDOW_DAYS = 30`, `DAY_MS`. |
| `server/src/modules/repos/helpers.ts` | modified | Boundary mapping (pure, no DB/HTTP/container): `toRepoStatsDto(repoId, windowDays, since, rollup)` turns raw severity buckets into the `RepoStats` contract. It always emits the three canonical buckets (0 when absent) and counts *every* finding into `findings_total`, because `findings.severity` is a free-text column (`db/schema/reviews.ts:35`) — unknown severities are counted but not invented into a bucket. Its input type is declared **structurally** (`RepoStatsRollup`), so the repos module imports nothing from the reviews module. |
| `server/src/modules/repos/service.ts` | modified | Application: `RepoService.stats(workspaceId, repoId)` — the only place with a business decision. Verifies the repo belongs to the workspace via its own `RepoRepository.getById` (404 otherwise ⇒ a foreign repo id is indistinguishable from a missing one), derives the window's `since`, resolves the review data through `container.reviewRepo`, and returns the DTO from `helpers`. No Fastify types, no SQL. |
| `server/src/modules/repos/routes.ts` | modified | Presentation: `GET /repos/:repoId/stats`, thin. Validates params with a local `RepoIdParams` (uuid), serializes with `response: { 200: RepoStats }` via `fastify-type-provider-zod`, reads tenancy with `getContext`, calls the service, returns its value. No logic. It sits in the `repos` module because the URL and the resource are repo-scoped; the module registry needs no change (`repos` is already registered in `modules/index.ts`). |

Container wiring: **none needed**. `container.reviewRepo` and `container.repoRepo` already exist in the composition
root (`server/src/platform/container.ts:105`, `:118`); no new adapter/port is introduced because the endpoint does no
external I/O — Postgres is reached through repositories, which is the sanctioned infrastructure path.

Not touched: no migration (the rollup is computed on read from existing tables), no new module, no client code.
Note for later: `client/src/vendor/shared/` mirrors these contracts; when the UI consumes `RepoStats`, mirror
`contracts/repo-stats.ts` + the barrel line there too. Out of scope for this backend-only task.

## Runtime flow

A request hits `GET /repos/:repoId/stats`. Fastify validates `:repoId` as a uuid against `RepoIdParams` (an invalid
id fails at the edge with a 422, never reaching the DB), the handler calls `getContext(app.container, req)` to resolve
the tenancy pair `{workspaceId, userId}` from the `AuthProvider` port, and delegates to `RepoService.stats(workspaceId,
repoId)`. The service first asks its own `RepoRepository.getById(workspaceId, repoId)` — this is the tenancy gate; a
repo in another workspace throws `NotFoundError` → 404. It then computes `since = now − 30 days` and calls
`container.reviewRepo.repoRunStatsSince(workspaceId, repoId, since)`; that `ReviewRepository` instance is built once by
the composition root, so the repos module never constructs, or imports, the reviews module's data layer. Inside,
`run.repo.ts` runs two grouped Drizzle queries — a `count(*)` over `agent_runs ⋈ pull_requests` (runs the repo had in
the window) and a `count(*) … group by findings.severity` over `findings ⋈ reviews ⋈ agent_runs ⋈ pull_requests`
(findings those runs produced) — both filtered by `agent_runs.workspace_id` as a second tenancy guard, and returns raw
`{ runs, findingsBySeverity }`. The service hands that to the pure `toRepoStatsDto`, which sums the total, fills the
three severity buckets, and produces the `RepoStats` contract shape; the route returns it and Fastify serializes it
through the `RepoStats` response schema. Dependencies point inward the whole way: routes → service → repositories, all
of them speaking the domain contract, and nothing inner ever sees Fastify or Drizzle.
