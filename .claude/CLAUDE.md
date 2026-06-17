# DevDigest — AI Code Review Studio

Local-first PR review tool powered by LLMs. Course starter — each lesson adds one feature.

## Stack

Next.js 15 · React 19 · Fastify 5 · Drizzle ORM · Postgres 16 + pgvector · TanStack Query v5 · Tailwind CSS 4 · TypeScript strict · pnpm >=10 · Vitest

## Commands

```sh
./scripts/dev.sh              # start everything (Docker + API + client)
./scripts/e2e.sh              # hermetic e2e tests (needs agent-browser)
```

Per-module commands: see each module CLAUDE.md.

## Project Map

| Package | Purpose | Port |
|---------|---------|------|
| `server/` | Fastify API + Drizzle + repo-intel indexer | 3001 |
| `client/` | Next.js App Router UI | 3000 |
| `reviewer-core/` | Pure review engine: diff -> prompt -> LLM -> findings | — |
| `e2e/` | Deterministic browser e2e flows | — |
| `server/src/vendor/shared/` | Zod contracts (shared by all packages) | — |

No monorepo workspace — each package has own `package.json` + lockfile.
Cross-package imports use **tsconfig path aliases**, not npm publishing.

## Coding Rules

- No error handling for impossible scenarios — trust the framework
- No comments where names are self-explanatory
- No features/refactoring beyond scope — fix only what is asked
- No backward-compat hacks — delete unused code directly
- No premature abstractions — three similar lines > early abstraction
- Always write secure code (SQL/XSS/command injection)
- TypeScript strict — all types explicit

## Read When

Read these **only when you are about to touch** the related topic:

| When working on | Read |
|---|---|
| Architecture, DI, review pipeline | `docs/architecture.md` |
| Server routes, modules, secrets | `server/README.md` |
| Client pages, UI routes | `client/README.md` |
| Review engine internals | `reviewer-core/README.md` |
| Testing strategy, CI | `TESTING.md` |
| Course lesson features | `docs/learnings.md` |
| Agent prompt authoring | `docs/agent-prompts/README.md` |
| E2E flow specs | `e2e/README.md` |
| UI component library | `client/src/vendor/ui/README.md` |
| Before starting work on a module | that module's `INSIGHTS.md` |

## Do-Not-Touch

- `client/src/vendor/ui/` — vendored UI kit (do not refactor without request)
- `server/src/vendor/shared/` — Zod contracts (synced across packages)
- `server/src/db/schema/` — has tables for future lessons; do not delete "unused" tables
- `.env` files with API keys — never commit

## Env Setup

Secrets stored in `~/.devdigest/secrets.json` (mode 0600), NOT in git.
See `server/.env.example` and `client/.env.example` for all variables.

## Session Wrap-Up

On session completion, run `/engineering-insights` to capture learnings into the relevant module's INSIGHTS.md. Do not skip this step.
