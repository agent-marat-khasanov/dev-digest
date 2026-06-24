---
name: onion-architecture
description: "DevDigest backend layering & dependency-rule expert (server/) — Onion / ports-and-adapters mapped onto our Fastify + Drizzle + Zod + manual-DI stack. ALWAYS invoke this skill when creating, splitting, moving, or wiring backend code and deciding WHICH LAYER it belongs to — routes, services, repositories, adapters, domain contracts, container wiring. Do not add or move backend code across layers, or wire the container, directly — consult this skill first. Enforces the dependency rule (dependencies point inward), keeps domain/services free of Fastify/Drizzle, reaches all external I/O through container-provided ports, and keeps reviewer-core pure. Does NOT cover Fastify route mechanics (use fastify-best-practices), Drizzle query syntax (use drizzle-orm-patterns), or Zod schema authoring (use zod)."
---

# DevDigest Onion Architecture

How backend code is **layered**, and which dependencies are **allowed**. This skill answers *"which layer does X belong to, and what may it import?"* — not how to write a Fastify route or a Drizzle query.

**Scope:** layer placement, the dependency rule, ports & adapters, keeping the core pure, DTO mapping at boundaries.
**Out of scope:** Fastify mechanics → `fastify-best-practices`; Drizzle query/schema syntax → `drizzle-orm-patterns`; Zod authoring → `zod`; Postgres design → `postgresql-table-design`.

## Prime directive: dependencies point inward

The domain is at the center. **Every dependency points toward the center; nothing inner ever imports anything outer.** A web framework, an ORM, an LLM SDK — all are swappable details on the outer ring. The business logic must not know they exist.

We use the **canonical Onion model** (domain → application → infrastructure → presentation) as the mental map, laid over our **real structure**: vertical-slice `modules/<name>/`, a manual DI `Container`, and port interfaces in `vendor/shared/`. The architecture already exists in the code — this skill makes its rules explicit so they don't erode.

## Layer ↔ code map (the central table)

| Onion layer (canonical) | In DevDigest | Where |
|---|---|---|
| **Domain** (core): contracts, domain types, **ports** | Zod contracts + adapter **interfaces** | `server/src/vendor/shared/contracts/*`, `server/src/vendor/shared/adapters.ts` (`LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `SecretsProvider`, `Embedder`); **`reviewer-core/` = the exemplar pure core** |
| **Application** (use cases): orchestration | `*Service` classes | `server/src/modules/<name>/service.ts` (`AgentsService`, …) |
| **Infrastructure**: persistence + external clients | repositories + adapters + db | `server/src/modules/<name>/repository.ts`, `server/src/adapters/*` (`OpenAIProvider`, `OctokitGitHubClient`, …), `server/src/db/*` |
| **Presentation**: HTTP edge | Fastify routes + Zod I/O | `server/src/modules/<name>/routes.ts` |
| **Composition root** (wires it all) | manual DI container | `server/src/platform/container.ts` (`class Container`, `ContainerOverrides`) |

The vertical slice `modules/<name>/{routes,service,repository,helpers}.ts` is **one module cutting through three rings** — presentation (routes) → application (service) → infrastructure (repository), with `helpers.ts` doing boundary mapping. → [layers.md](layers.md)

## Decision rules — "which layer does X go in?"

| You are adding… | Put it… |
|---|---|
| An HTTP endpoint (validate request, call service, serialize) | `modules/<name>/routes.ts` (presentation) |
| Business logic / orchestration of repos + adapters | `modules/<name>/service.ts` (application) |
| A SQL/Drizzle query | `modules/<name>/repository.ts` (infrastructure) |
| A call to an external system (LLM, GitHub, git, embeddings) | an **adapter** in `adapters/<name>/`, behind a port interface, resolved from the `Container` |
| The **interface** an adapter must satisfy (a port) | `vendor/shared/adapters.ts` (domain) — implemented in `adapters/` |
| A row → DTO / DTO → row conversion | `modules/<name>/helpers.ts` (boundary mapping) |
| A request/response shape (contract) | a Zod schema in `vendor/shared/contracts/*` (do not edit by hand outside its sync rules) |
| Pure review logic (diff → prompt → grounding → findings) | `reviewer-core/` — keep it I/O-free |
| Wiring a new dependency into the graph | `platform/container.ts` (composition root) |

## Hard rules

1. **Dependencies point inward only.** presentation → application → domain; infrastructure *implements* domain ports. No inner layer imports an outer one (a service never imports a route; the domain never imports a repository). → [dependency-rule.md](dependency-rule.md)
2. **Keep the core pure.** Domain contracts/types and **`reviewer-core`** never import Fastify, Drizzle, Octokit, or anything HTTP/DB. `reviewer-core` performs zero I/O except through injected ports (e.g. `LLMProvider`). → [layers.md](layers.md)
3. **All external I/O goes through container ports.** LLM, GitHub, git, secrets, code-index, embeddings are reached only via the interfaces in `vendor/shared/adapters.ts`, resolved from the `Container`. No `new OpenAI()` / direct SDK construction inside a service. → [ports-and-adapters.md](ports-and-adapters.md)
4. **Routes are thin.** Presentation validates (Zod schema), reads context (`getContext`), calls the service, returns the result for serialization. No business logic in `routes.ts`. → [examples.md](examples.md)
5. **Map at the boundary.** Convert rows ↔ DTOs in `helpers.ts`; hand HTTP the Zod contract shape, never a raw Drizzle row. → [examples.md](examples.md)
6. **Compose only at the root.** Adapters/repos/services are wired through the `Container`; a service receives its dependencies, it does not construct adapters itself. Tests swap implementations via `ContainerOverrides`. → [ports-and-adapters.md](ports-and-adapters.md)
7. **Pragmatic allowances (no ceremony for its own sake).** A Drizzle `$inferSelect` row is an acceptable data model *within a module*; a concrete repository is acceptable infrastructure. Introduce an explicit `interface XRepository` port only when a second implementation genuinely appears — *twice, tolerate; thrice, extract*. We do **not** mandate DDD entities/value-objects or a separate use-case layer. → [dependency-rule.md](dependency-rule.md)

## Reference files

- [layers.md](layers.md) — each layer's responsibility & allowed imports, mapped to `modules/`; `reviewer-core` as the pure-core exemplar
- [dependency-rule.md](dependency-rule.md) — the dependency direction, who-imports-whom table, forbidden imports, how to enforce
- [ports-and-adapters.md](ports-and-adapters.md) — the `Container` composition root, ports vs adapters, how to add an adapter
- [examples.md](examples.md) — good/bad pairs on real modules (`agents`, `reviews`)
- [references.md](references.md) — external sources & rationale

## Do-not-touch (from CLAUDE.md)

`vendor/shared/` holds Zod contracts **and** the port interfaces — synced across packages; import via aliases, follow its sync rules, don't hand-edit casually. `db/schema/` keeps tables for future lessons — don't delete "unused" ones.
