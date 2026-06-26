# Rule: Skill Routing (canonical)

Single source of truth for which project skills to invoke, in which order, before writing code.
The `planner` plans against this set; the `implementer` invokes from it; `test-writer` follows the
UI/backend split. Keep this file in sync with the `## Skill Routing` table in `AGENTS.md` — change
both together. **Architecture/placement skill is ALWAYS first; then framework skills as relevant.**

## Backend task (touching `server/` or `reviewer-core/`)

1. `onion-architecture` — **always first** (layer placement, dependency rule, container wiring).
2. Then, as relevant:
   - `fastify-best-practices` — routes, plugins, hooks, lifecycle
   - `drizzle-orm-patterns` — schema, queries, transactions, migrations
   - `postgresql-table-design` — tables, indexes, constraints, migration design
   - `zod` — contracts in `vendor/shared`
   - `security` — auth, untrusted input, secrets, injection
   - `typescript-expert` — non-trivial type-level work

## UI task (touching `client/`)

1. `frontend-architecture` — **always first** (code placement, RSC / server-vs-client boundary,
   co-location, path aliases).
2. Then, as relevant:
   - `react-best-practices` / `next-best-practices` — components, hooks, state, RSC, data patterns
   - `react-testing-library` — component/hook tests
   - `zod` — contracts in `vendor/shared`
   - `security` — untrusted input, XSS
   - `typescript-expert` — non-trivial type-level work

## Backend tests

- `backend-testing` — Vitest + Fastify `.inject()` + Drizzle + testcontainers (unit `*.test.ts`,
  integration `*.it.test.ts`).

## Not for implementation tasks

`pr-self-review`, `engineering-insights`, `mermaid-diagram` are manual/utility skills — never assign
them to an implementation task.
