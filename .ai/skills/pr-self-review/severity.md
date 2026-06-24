# Severity rubric

How `pr-self-review` decides whether a finding is `critical` (gates the push), `high`, `medium`, or `low` (reported only, user decides). When two lenses produce the same finding, take the higher severity.

## `critical` — refuse the push

Anything in this category **blocks `git push` / `gh pr create`** until fixed.

### Security (from `security` lens — every file)

- SQL injection, XSS, command injection, prototype pollution, SSRF, path traversal
- Secret committed to source (API key, token, password, private key) — including `.env*` files outside `.env.example`
- Missing authorization on a protected route, broken access control, IDOR
- Use of dangerous APIs without justification (`eval`, `dangerouslySetInnerHTML` with untrusted input, `child_process.exec` with user input)
- Crypto misuse: weak hash for passwords, predictable randomness for security tokens, hardcoded IV

### Onion / dependency rule (from `onion-architecture`)

- `server/src/modules/**/service.ts` imports anything from `fastify`, `@fastify/*`, `drizzle-orm`, Octokit, an LLM SDK, or any other outer-layer concrete
- `server/src/modules/**/routes.ts` contains business logic (DB queries, multi-step orchestration) instead of `service.method(...)` calls
- `server/src/modules/**/repository.ts` imports Fastify or makes external network calls
- `reviewer-core/**` performs any I/O — imports `fetch`, `fs`, an HTTP client, an SDK directly (must go through an injected port)
- `new OpenAI()`, `new Octokit()`, or any direct adapter construction inside a service or route — composition only happens in `platform/container.ts`
- Adapter under `server/src/adapters/**` does not implement a port from `vendor/shared/adapters.ts`

### Frontend (from `frontend-architecture`, `react-best-practices`, `next-best-practices`)

- Raw `fetch()` / `axios` / `XMLHttpRequest` outside `client/src/lib/api.ts`
- Any edit under `client/src/vendor/ui/` or `client/src/vendor/shared/` — these are vendored, read-only
- Reaching into another component's internals via deep path (`../OtherComponent/_components/...`) instead of its barrel
- `"use client"` placed on a route file when only a leaf needs it (pushes a whole tree to the client bundle)
- Mutating Next.js request/response objects or directly throwing in a Server Component without `error.tsx`
- Hooks called conditionally, inside loops, or after early returns (Rules of Hooks violation)

### Contract drift (from `zod` lens on `vendor/shared/`)

- `server/src/vendor/shared/**` modified **without** the corresponding mirror change under `client/src/vendor/shared/**`
- Breaking change to a published Zod contract (removed field, narrowed type, renamed key) without a corresponding consumer update

### Database (from `drizzle-orm-patterns`, `postgresql-table-design`)

- Migration deletes data without an explicit backfill / rollback note
- Schema change drops a column referenced in code that wasn't grep-cleaned
- Missing index on a foreign-key column or on a column used in a `WHERE` of a hot query
- Deleting a table from `server/src/db/schema/` (CLAUDE.md: keep tables for future lessons)

### Build / test

- `pnpm typecheck` fails in any affected module
- `pnpm test` fails in any affected module
- `pnpm build` fails in `client/` (if it was affected)

## `high` — strongly recommend fixing, push allowed

User decides; not blocking.

- Anti-pattern from `react-best-practices` that doesn't break Rules of Hooks (over-large component, deeply nested state, `useEffect` for derived state)
- Missing test for a new exported function/component in a module that already has co-located tests
- `console.log` / `debugger` left in source
- Public API change without a JSDoc/`@deprecated` marker (when the rest of the file uses them)
- `any` introduced where the surrounding code is strict (from `typescript-expert`)
- New shared helper added to `client/src/lib/` when the same code only exists in one place (premature shared promotion, violates "twice — tolerate; thrice — extract")

## `medium`

- Naming inconsistency with the surrounding folder/file conventions
- Co-location violation that is borderline (a `helpers.ts` that *might* be page-scoped)
- TanStack Query key not a flat tuple (`["reviews", { prId }]` instead of `["reviews", prId]`)
- A Fastify route handler doing two responsibilities that could be split (style, not architecture)
- Tests that hit implementation details instead of behavior (from `react-testing-library` anti-patterns)

## `low`

- Comments that restate the code
- Minor formatting inconsistencies the formatter would fix on save
- Unused import (typecheck usually catches this — note only)
- Doc-string phrasing

## Special: contract-sync drift detection

When any file under `server/src/vendor/shared/` is in the diff:

1. List the changed files: `git diff --name-only main...HEAD -- server/src/vendor/shared/ | sed 's|^server|client|'`
2. For each, verify the same path appears in `git diff --name-only main...HEAD -- client/src/vendor/shared/`
3. If a server-side path has no client-side counterpart in the diff → emit `critical` "contract drift" finding listing the missing mirror paths

This rule exists because the two directories are intentionally byte-identical mirrors per `vendor/shared/` sync rules.
