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

## Open Questions

<!-- What remains unresolved -->
