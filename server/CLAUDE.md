# @devdigest/api — Server Module

Fastify 5 API with Drizzle ORM on Postgres 16 + pgvector. DI-based, modular plugin architecture.

## Commands

```sh
pnpm dev                     # tsx watch src/server.ts (hot reload)
pnpm test                    # unit + integration tests
pnpm exec vitest run --exclude "**/*.it.test.ts"  # unit only (no Docker)
pnpm typecheck               # tsc --noEmit
pnpm db:migrate              # apply Drizzle migrations (manual, NOT on boot)
pnpm db:seed                 # seed demo data (idempotent)
pnpm db:generate             # generate migration after schema change
```

## Architecture

- **Entry:** `src/server.ts` -> `src/app.ts` (Fastify factory)
- **DI container:** `src/platform/container.ts` — composition root for all adapters, repos, services
- **Modules:** `src/modules/<name>/` — Fastify plugin with `routes.ts` + `service.ts` + `repository.ts`
- **Adapters:** `src/adapters/` — external services (LLM, GitHub, git, code-index, ast-grep, embedder)
- **Contracts:** `src/vendor/shared/` — Zod schemas shared with client + reviewer-core

## Conventions

- Every route uses `fastify-type-provider-zod` — Zod schemas validate request AND serialize response
- Every table is workspace-tenanted (`workspace_id` FK) — all queries MUST scope by workspace
- `*.it.test.ts` = integration tests (real Postgres via testcontainers, need Docker)
- Migrations are manual: always `pnpm db:migrate` after schema changes — server does NOT auto-migrate
- On boot, stale `agent_runs` in `running` status are reaped to `cancelled`
- Secrets live in `~/.devdigest/secrets.json` (mode 0600), never in DB

## Gotchas

- Schema has tables for future lessons (eval, ci, memory, conventions) — empty but valid, do not delete
- `reviewer-core` is imported as TypeScript source via path alias, not as a built package
- Rate-limit: 120 req/min global via `@fastify/rate-limit`

## Read When

- `README.md` — full module map, route table, DI flow
- `src/modules/repo-intel/README.md` — indexer pipeline, facade API
- `INSIGHTS.md` — module-specific gotchas and non-obvious behavior
- `docs/` — server-specific documentation
