# File classification — path-glob → lens-set

How `pr-self-review` decides which existing skills to apply to each changed file. The table is exhaustive; **every changed path falls into exactly one row** (rows are tried top-to-bottom; first match wins). Anything that reaches the catch-all gets a generic review — no path is silently skipped.

The lens names below are project skills under `.ai/skills/`; click the row's lenses to read each one. The `security` lens applies *in addition* to every row.

## Frontend (`client/`)

| Path glob | Lenses applied | Rationale |
|---|---|---|
| `client/src/vendor/**` | **REFUSE — vendored, read-only per CLAUDE.md** | UI kit + Zod contracts are synced from external sources; hand-edits diverge them silently. |
| `client/**/*.test.{ts,tsx}` | `react-testing-library`, `typescript-expert` | Test-only files don't need architecture/perf lenses; they need RTL conventions. |
| `client/src/app/**/page.tsx`, `client/src/app/**/layout.tsx` | `frontend-architecture`, `next-best-practices`, `react-best-practices`, `typescript-expert` | Routes — RSC placement, metadata, async APIs, data-fetching patterns all live here. |
| `client/src/app/**/_components/**`, `client/src/components/**` | `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert` | Component code — co-location, folder-per-component, `"use client"` placement, anti-patterns. |
| `client/src/lib/api.ts`, `client/src/lib/hooks/**` | `frontend-architecture`, `react-best-practices`, `typescript-expert` | All network access funnels through `lib/api.ts`; TanStack Query hooks live in `lib/hooks/`. |
| `client/src/lib/**` (other infrastructure) | `frontend-architecture`, `typescript-expert` | Providers, theme, toast, contexts — placement-sensitive. |
| `client/**/*.{ts,tsx}` (catch-all) | `frontend-architecture`, `typescript-expert` | Anything else under `client/` still gets the architecture lens. |

## Backend (`server/`)

| Path glob | Lenses applied | Rationale |
|---|---|---|
| `server/src/vendor/shared/**` | `zod`, `typescript-expert` + **sync-warning** | Zod contracts + port interfaces, mirrored into `client/src/vendor/shared/`. Any change here MUST also change the mirror — flag as `critical` if not. |
| `server/src/modules/**/routes.ts` | `onion-architecture`, `fastify-best-practices`, `zod`, `typescript-expert` | Presentation layer — Fastify mechanics + Zod I/O + thin-routes rule. |
| `server/src/modules/**/service.ts` | `onion-architecture`, `typescript-expert` | Application layer — no Fastify/Drizzle imports allowed. |
| `server/src/modules/**/repository.ts` | `onion-architecture`, `drizzle-orm-patterns`, `typescript-expert` | Infrastructure layer — Drizzle queries live here, not in services. |
| `server/src/modules/**/helpers.ts` | `onion-architecture`, `typescript-expert` | Boundary mapping (row ↔ DTO); must keep DTOs HTTP-ready. |
| `server/src/adapters/**` | `onion-architecture`, `typescript-expert` | External I/O behind ports — adapter must satisfy a port from `vendor/shared/adapters.ts`. |
| `server/src/db/schema/**` | `drizzle-orm-patterns`, `postgresql-table-design` | Schema design — types, indexes, constraints. Also: do not delete "unused" tables (CLAUDE.md). |
| `server/src/db/migrations/**` | `drizzle-orm-patterns`, `postgresql-table-design` | Migrations — `drizzle-kit` flow, irreversible changes need attention. |
| `server/src/platform/container.ts` | `onion-architecture`, `typescript-expert` | Composition root — the only place adapters are constructed. |
| `server/**/*.test.ts` | `typescript-expert` | Backend tests — no dedicated lens yet; keep TS lens. |
| `server/**/*.ts` (catch-all) | `onion-architecture`, `typescript-expert` | Any other backend file still gets layering + TS. |

## Pure core (`reviewer-core/`)

| Path glob | Lenses applied | Rationale |
|---|---|---|
| `reviewer-core/src/**` | `onion-architecture` (**purity rule**), `typescript-expert` | The pure-core exemplar — must remain I/O-free; ports are the only escape. Critical if Fastify/Drizzle/HTTP/SDK import appears. |
| `reviewer-core/**/*.test.ts` | `typescript-expert` | Tests for the pure core. |

## E2E (`e2e/`)

| Path glob | Lenses applied | Rationale |
|---|---|---|
| `e2e/**` | `typescript-expert` | No e2e-specific project skill exists yet; the TS lens is the minimum bar. |

## Repo-level

| Path glob | Lenses applied | Rationale |
|---|---|---|
| `**/package.json`, `**/pnpm-lock.yaml`, `**/tsconfig*.json` | (generic review) | Dependency / build / TS-config diffs — review for unintended drift; no specific lens. |
| `**/*.md`, `docs/**` | (generic review) | Docs — check for stale paths/commands, no specific lens. |
| `scripts/**`, `.github/**`, `.husky/**` | `security` (in addition) + generic review | Anything that executes on a dev/CI machine gets the security lens. |

## Catch-all

Any path that matches none of the rows above → log the path, do a brief generic review (read the file, look for obvious smells), do **not** skip silently. If you find yourself adding the same uncategorised path repeatedly, add a row here.

## How findings are merged

A single file may activate multiple lenses (a route gets onion + fastify + zod + security + ts). When two lenses report the same line, **keep the higher severity** and merge the explanations. Don't print duplicates.

The `security` lens always runs on every changed file — it is the only lens guaranteed to apply universally.
