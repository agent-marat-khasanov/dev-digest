# The Dependency Rule

> *All code can depend on layers more central than itself; no code may depend on a layer further out.* — the one rule that makes Onion work.

Everything else in this skill is a consequence of this. If a change would make an inner layer import an outer one, the change is wrong — invert it.

## Who may import whom

| Layer | May import | May NOT import |
|---|---|---|
| **Domain** (`vendor/shared/contracts`, `vendor/shared/adapters.ts`, `reviewer-core`) | other domain, Zod, plain TS | Fastify, Drizzle, vendor SDKs, `Container`, any `service`/`routes`/`repository` |
| **Application** (`modules/*/service.ts`) | domain, own `repository`, `Container`, `platform/errors` | Fastify request/reply, route modules |
| **Infrastructure** (`modules/*/repository.ts`, `adapters/*`, `db/*`) | domain ports (to implement), Drizzle, SDKs | route modules, sibling services' internals |
| **Presentation** (`modules/*/routes.ts`) | everything inward, Fastify | — (outermost; but keep it thin) |
| **Composition root** (`platform/container.ts`) | all concretes | — (this is the only place that may know every concrete) |

The direction is always toward the center. A `service.ts` importing from a `routes.ts`, or `vendor/shared` importing from `adapters/`, is a violation.

## The inversion in one move

The naive direction is "application calls the OpenAI SDK." Onion inverts it:

```
        ┌─────────────── domain ───────────────┐
        │  interface LLMProvider { … }  (port)  │
        └───────────────▲──────────▲────────────┘
                        │ implements │ depends on
        ┌───────────────┴──┐    ┌───┴──────────────┐
        │ adapters/llm/    │    │ modules/*/service │
        │ OpenAIProvider   │    │ (uses the port)   │
        └──────────────────┘    └──────────────────┘
```

Both the adapter **and** the service depend on the port in the core. Neither depends on the other. Swap `OpenAIProvider` for `MockLLMProvider` and nothing inward changes — that is the whole point.

## Forbidden imports in the core — quick checklist

Inside `reviewer-core/` and `vendor/shared/`:

- ❌ `import … from 'fastify'` / `FastifyRequest` / `FastifyReply`
- ❌ `import … from 'drizzle-orm'` / anything under `db/`
- ❌ `import … from 'openai' | '@octokit/*' | 'simple-git'` (vendor SDKs)
- ❌ `import … from '…/platform/container'`
- ❌ `node:fs`, `node:child_process`, raw network calls

If the core needs one of these, it needs a **port** instead: declare an interface in `vendor/shared/adapters.ts`, implement it in `adapters/`, inject it.

## Pragmatic allowances (rule 7, restated)

We force the *direction*, not ceremony:

- A Drizzle `$inferSelect` **row is an acceptable model** within a module. We don't mandate a separate domain entity class that mirrors every column.
- A **concrete repository is acceptable infrastructure**. You don't need an `interface AgentsRepository` port until a *second* implementation is real.
- Ports are **required for cross-process I/O** (LLM, GitHub, git, secrets, embeddings) — because those are the volatile, mockable, swappable details Onion exists to isolate. They already live in `vendor/shared/adapters.ts`.

*Twice, tolerate; thrice, extract.* Add abstraction when a real second case forces it, not preemptively.

## How to enforce it

- **Code review:** the table above is the checklist. The most common real violation is business logic creeping into `routes.ts` (rule 4) or a service constructing an SDK directly (rule 3).
- **Tooling:** the repo already ships `dependency-cruiser` via the `adapters/depgraph` adapter. It can encode "nothing under `vendor/shared` or `reviewer-core` may import `fastify`/`drizzle-orm`/`adapters`" as a forbidden-dependency rule and fail CI on violation. Reach for that before the rule erodes by a thousand small edits.
