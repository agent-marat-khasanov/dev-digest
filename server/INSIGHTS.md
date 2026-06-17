# Server INSIGHTS

## What Works

- Route -> Service -> Repository plugin structure per module
- Zod schemas on both sides (validate request + serialize response via fastify-type-provider-zod)
- All queries scoped by workspace_id

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

## Recurring Errors & Fixes

- "relation does not exist" -> migrations not applied: cd server && pnpm db:migrate
- Port 5432 in use -> another Postgres running; change host port in docker-compose.yml
- pgvector errors -> migrations ran against wrong DB (not Docker one)
- Reset all -> docker compose down -v && ./scripts/dev.sh

## Session Notes

<!-- Dated session summaries — add after each significant session -->

## Open Questions

<!-- What remains unresolved -->
