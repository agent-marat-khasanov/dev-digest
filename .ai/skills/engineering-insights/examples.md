# Engineering Insights — Examples

How to write entries that are actually useful vs entries that are noise.

---

## The Quality Test

> "If this were obvious to anyone reading the code — don't write it."

Each entry must be **actionable cold**: an agent reads it with zero context and knows exactly what to do.

---

## Bad vs Good Examples

### What Works

| Bad (noise) | Good (actionable) |
|---|---|
| "Zod works well for validation" | "Zod response schemas on Fastify routes catch contract breaks at the source — if the handler returns a field the schema doesn't declare, Fastify throws 500 immediately. Saved 2h debugging a missing field in /pulls/:id response" |
| "DI pattern is useful" | "Injecting MockLLMProvider in reviewer-core tests runs the full review pipeline in <100ms without API keys — use this pattern for any new adapter tests" |

### What Doesn't Work

This is the **most valuable section** — teams skip it most often.

| Bad (noise) | Good (actionable) |
|---|---|
| "Promises can be tricky" | "Promise.all() on the repo-intel indexing pipeline times out after 30 files — use Promise.allSettled() with batches of 10 via p-queue" |
| "be careful with async" | "Calling container.llm() inside a map() without concurrency control hits OpenAI rate limits instantly — always use p-queue with concurrency: 3" |

### Codebase Patterns

| Bad (noise) | Good (actionable) |
|---|---|
| "We use modules" | "Every server module follows routes.ts + service.ts + repository.ts structure. If adding a new feature, create all three files — the route handler should never contain business logic" |
| "Zod schemas are shared" | "When changing a Zod contract in server/src/vendor/shared/, you MUST also check client/src/vendor/shared/ — they are separate copies synced manually, not symlinks" |

### Tool & Library Notes

| Bad (noise) | Good (actionable) |
|---|---|
| "Drizzle is nice" | "drizzle-kit generate must run BEFORE db:migrate — if you run migrate first, it silently applies an empty migration and your schema change is lost" |
| "testcontainers is slow" | "testcontainers first run pulls the Postgres Docker image (~200MB). Set TESTCONTAINERS_RYUK_DISABLED=true in CI to avoid the reaper container timeout" |

### Recurring Errors & Fixes

| Bad (noise) | Good (actionable) |
|---|---|
| "DB errors happen" | "'relation does not exist' -> migrations not applied. Fix: cd server && pnpm db:migrate. Happens after git pull if new migrations were added" |
| "port conflicts" | "Port 5432 already in use -> local Postgres conflicts with Docker. Fix: stop local Postgres (brew services stop postgresql) OR change docker-compose.yml port to 5433:5432" |

### Session Notes

Format: dated summary of what happened and what was decided.

**Bad:**
> Worked on stuff today.

**Good:**
> ### 2026-06-17
> Refactored ReviewRunExecutor to support multi-agent runs. Key decision: each agent gets its own RunExecutor instance (not shared) because agent versions must be snapshotted independently. The RunBus now accepts a parentRunId to group SSE events.

### Open Questions

**Bad:**
> Is this a bug?

**Good:**
> The grounding gate drops findings that cite line numbers outside the diff range, but what happens when a finding references a line that was deleted (present in the "-" side of the diff but not the "+" side)? Currently it passes — is that intentional?

---

## DevDigest-Specific Patterns

When writing insights for this project, remember:

- **Module boundary matters** — an insight about Drizzle goes in `server/INSIGHTS.md`, not root
- **reviewer-core is pure** — any insight about adding I/O to it belongs in "What Doesn't Work"
- **Workspace tenancy** — every query insight should mention workspace_id scoping
- **Schema has future tables** — "unused table" insights should note it is for future course lessons
