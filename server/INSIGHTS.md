# Server INSIGHTS

## What Works

- Route -> Service -> Repository plugin structure per module
- Zod schemas on both sides (validate request + serialize response via fastify-type-provider-zod)
- All queries scoped by workspace_id
- Nullable Drizzle columns (`doublePrecision('cost_usd')` without `.notNull()`) for backward-compatible schema evolution — existing rows get `null`, no default needed, tests pass with `cost_usd: null` in mocks

## What Doesn't Work

<!-- Dead ends and anti-patterns — the most valuable section, don't skip -->

## Codebase Patterns

<!-- Conventions and architectural decisions -->

- Every Fastify module is a plugin registered in src/modules/index.ts (no autoload)
- DI container in platform/container.ts is the single composition root
- Secrets never in DB — always in ~/.devdigest/secrets.json (mode 0600)
- Any query that aggregates findings through `findings JOIN reviews` MUST filter `reviews.kind = 'review'` — the `reviews` table also holds `kind='summary'` rows (and may gain more kinds). Omitting the filter silently inflates counts. Both `pulls/routes.ts` (PR list) and `run.repo.ts` (timeline) enforce this

## Tool & Library Notes

<!-- Quirks and gotchas of dependencies -->

- fastify-type-provider-zod: response schema mismatch throws 500 (not 422) — always validate both sides
- drizzle-kit generate: must run before db:migrate, otherwise migration is empty
- testcontainers: slow on first run (pulls Docker image); fast on subsequent runs
- Drizzle `doublePrecision` maps to PostgreSQL `double precision` — use it for fractional values like USD costs (not `integer`). Cost computation happens in `run-executor.ts` using OpenRouter's `usage.cost` when available, falling back to `estimateCost(model, tokensIn, tokensOut)`

## Recurring Errors & Fixes

- "relation does not exist" -> migrations not applied: cd server && pnpm db:migrate
- Port 5432 in use -> another Postgres running; change host port in docker-compose.yml
- pgvector errors -> migrations ran against wrong DB (not Docker one)
- Reset all -> docker compose down -v && ./scripts/dev.sh

## Session Notes

### 2026-06-18 — Run Cost Badge
- Added `cost_usd` column to `agent_runs` table (nullable `doublePrecision`)
- Cost flows through shared Zod contracts: `RunStats`, `RunSummary`, `PrMeta`
- `PrMeta.cost_usd` is aggregated sum over a PR's done agent_runs (computed in SQL/pulls route)
- Shared contracts live in BOTH `server/src/vendor/shared/` and `client/src/vendor/shared/` — both must be updated in sync
- Test contract fixture in `server/test/contracts.test.ts` must include `cost_usd` to pass Zod validation

### 2026-06-18 — Findings Severity Badges
- Per-severity findings counts (CRITICAL/WARNING/SUGGESTION) added to both `PrMeta` (as nested `findings_by_severity` object) and `RunSummary` (as flat `sev_critical`/`sev_warning`/`sev_suggestion` — matching the existing flat scalar pattern on RunSummary)
- No DB schema changes needed: severity breakdown is computed at query time via `findings JOIN reviews GROUP BY severity` — the `findings` table already stores severity per row
- Pattern for cross-table aggregation on the PR list: the pulls route stacks multiple IN-queries (score, cost, findings) gated by `if (prIds.length > 0)`, each building a `Map<prId, value>` consumed in the final `.map()` return. New aggregations follow this same pattern
- `run.repo.ts` `listRunsForPull()` now includes a secondary query for per-run severity breakdown via `reviews.run_id` join — the function is no longer a single-query mapper

## Open Questions

<!-- What remains unresolved -->
