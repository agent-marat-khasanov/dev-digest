# Rule: Architecture Map (single source of truth)

Canonical structural facts for DevDigest. Agents READ this instead of embedding their own copy, so
the map never drifts. If the project structure changes, update THIS file only.

## Package map

| Package | Purpose | Port |
|---------|---------|------|
| `server/` | Fastify API + Drizzle + repo-intel indexer | 3001 |
| `client/` | Next.js 15 App Router UI (React 19) | 3000 |
| `reviewer-core/` | Pure review engine: diff → prompt → LLM → findings | — |
| `e2e/` | Deterministic browser e2e flows | — |
| `server/src/vendor/shared/` | Zod contracts shared by all packages | — |

No monorepo workspace — each package has its own `package.json` + lockfile.

## Path aliases (cross-package imports go through tsconfig, not npm)

- `@devdigest/shared` → `server/src/vendor/shared`
- `@devdigest/reviewer-core` → `reviewer-core/src`
- `@devdigest/ui` → `client/src/vendor/ui`
- `@/*` → `client/src`

(If in doubt, read the relevant `tsconfig.json` `paths` — it is authoritative.)

## Backend layer map (onion / ports-and-adapters)

| Layer | Location | Rule |
|-------|----------|------|
| Domain / ports | `server/src/vendor/shared/` (Zod contracts + adapter interfaces) | innermost; depends on nothing |
| Application | `server/src/modules/<m>/service.ts` | orchestration; depends on domain/ports only |
| Infrastructure | `repository.ts`, `server/src/adapters/`, `server/src/db/` | implements ports |
| Presentation | `server/src/modules/<m>/routes.ts` | HTTP edge |
| Composition root | `server/src/platform/container.ts` | the ONLY place that wires concretes |

**Dependency rule: source dependencies point inward only.** Inner layers know nothing about outer.
Frontend boundary rules (RSC / server-vs-client, co-location, folder-per-component) live in the
`frontend-architecture` skill.
