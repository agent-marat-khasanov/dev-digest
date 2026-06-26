# DevDigest — AI Code Review Studio

Local-first PR review tool powered by LLMs. Course starter — each lesson adds one feature.

## Stack

Next.js 15 · React 19 · Fastify 5 · Drizzle ORM · Postgres 16 + pgvector · TanStack Query v5 · Tailwind CSS 4 · TypeScript strict · pnpm >=10 · Vitest

## Commands

```sh
./scripts/dev.sh              # start everything (Docker + API + client)
./scripts/e2e.sh              # hermetic e2e tests (needs agent-browser)
```

Per-module commands: see each module AGENTS.md.

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

## Workflow Rules

- **Ask, don't assume.** If something is unclear, ask before writing a single line. Never make silent assumptions about intent, architecture, or requirements.
- **Simplest solution first.** Always implement the simplest thing that could work. Do not add abstractions or flexibility that weren't explicitly requested.
- **Don't touch unrelated code.** If a file or function is not directly part of the current task, do not modify it, even if you think it could be improved.
- **Flag uncertainty explicitly.** If you are not confident about an approach or technical detail, say so before proceeding. Confidence without certainty causes more damage than admitting a gap.
- **Suggest better ways.** I'm always open to ideas on better ways to do things. Please don't hesitate to suggest a better way.

## Skill Routing

Before writing code in these domains you MUST invoke the matching skill via the Skill tool
**first** — this is not discretionary. When several apply, invoke the architecture/placement skill
before the framework skill.

| When you are about to… | Invoke (in order) |
|---|---|
| touch any file under `client/` (component, hook, page) | `frontend-architecture` → `react-best-practices` / `next-best-practices` |
| add/move backend code across layers or wire the container (`server/`) | `onion-architecture` |
| write/modify a Fastify route, plugin, or hook | `fastify-best-practices` |
| write/modify a Drizzle schema or query | `drizzle-orm-patterns` |
| design/alter a Postgres table, index, or migration | `postgresql-table-design` |
| write/modify a Zod contract in `vendor/shared` | `zod` |
| write/modify React component or hook tests | `react-testing-library` |
| write/modify server or reviewer-core tests (unit, integration, route) | `backend-testing` |
| implement auth, handle user input, or review for vulnerabilities | `security` |
| do non-trivial TypeScript type-level work | `typescript-expert` |

(Manual/utility skills — `pr-self-review`, `engineering-insights`, `mermaid-diagram` — are NOT in
this table by design; invoke them only per their own rules.)

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

- **After every non-trivial task** (feature, bugfix, review fix) — capture engineering insights into the relevant module `INSIGHTS.md` immediately, before reporting completion. Do not batch insights until the end of the session; capture them while context is fresh. (Claude Code users: run `/engineering-insights`.)
- Trivial changes (typo, config tweak, single-line fix with no surprises) may skip this step.
