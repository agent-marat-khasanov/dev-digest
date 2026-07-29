# Architecture Review — `insight-core` (proposed pure core package)

Standard applied: `.ai/skills/onion-architecture` (SKILL.md + layers.md + dependency-rule.md +
ports-and-adapters.md + examples.md). `reviewer-core` is the exemplar the package claims to follow:
**zero I/O except through injected ports, no DB, no filesystem, no vendor SDKs.**

Verdict: the package is **not a pure core**. Three of its six files perform or wire real I/O, and
one port is declared in the wrong place. Four findings.

## Findings

### 1. `store.ts` — database persistence inside the core (rules 1 & 2) — CRITICAL

`store.ts:1-3` imports `drizzle-orm` and reaches across the package boundary into
`server/src/db/client` and `server/src/db/schema`, then runs select/update/insert against Postgres.
This is verbatim the anti-pattern in examples.md #4 ("ORM / framework leaking into the core") and
breaks the dependency rule in the worst direction: a core package depending on server
infrastructure. `run.ts:5,42` (`persistReport`) is the same violation surfacing in the
orchestrator — the "pure" pipeline now cannot run without a live database.

**Fix:** delete `store.ts`; `runInsights` returns the `InsightReport` and the *server* persists it —
a `modules/insights/` slice with a repository, wired through the `Container`. Remove the
`persistReport` import and call from `run.ts`.

### 2. `enrich.ts` — raw `fetch()` to the GitHub API (rules 2 & 3) — CRITICAL

`enrich.ts:13-16` calls `api.github.com` directly from the core. Raw network calls are on the
forbidden-imports checklist for core code, and GitHub access is exactly the kind of cross-process
I/O that must go through a port. The core may say *what* it needs (commit authors per file), never
call the vendor API itself — and as written it is unmockable and untestable offline.

**Fix:** depend on a port — either the existing `GitHubClient` in `vendor/shared/adapters.ts` or a
minimal ownership-lookup interface — passed into `runInsights` alongside `llm`; the server resolves
the concrete adapter from the `Container`.

### 3. `summary.ts` — `pino` logger constructed inside the core (rules 2 & 6) — MAJOR

`summary.ts:1,4` imports the `pino` SDK and constructs a logger singleton at module scope, used at
line 15. That wires a concrete, side-effecting dependency (stdout I/O) into an otherwise pure
function, and the core constructs it itself instead of receiving it (compose-only-at-the-root).

**Fix:** drop `pino`. If observability is wanted, use the already-injected `onProgress` callback or
accept an optional logger port via `RunInsightsOptions`.

### 4. `run.ts` — duplicated `LLMProvider` port declared locally — MODERATE

`run.ts:7-9` redeclares `LLMProvider` with its own (incompatible) shape. The skill's port-location
rule is explicit: when a package outside `server/` names a port, it lives in
`vendor/shared/adapters.ts` — that is precisely why the real `LLMProvider` is there
(`reviewer-core` names it). A parallel local port drifts from the interface the server's adapters
and `Container` actually implement, so the container-resolved provider cannot be handed to
`insight-core` without a shim.

**Fix:** import `LLMProvider` from `@devdigest/shared`; if `insight-core` needs a capability the
shared port lacks, extend it there.

## What is fine (not reported)

- `types.ts` and `prompt.ts` — pure domain types and pure prompt assembly; exactly what belongs in a core.
- Injecting the LLM via `RunInsightsOptions` and the `onProgress` callback pattern — correct
  dependency-injection shape (only the port's *location* is wrong, finding 4).
- `parseThemes` and `groupFindings` logic — pure functions, correctly placed.

## Shape after fixes

`insight-core` = `types.ts` + `prompt.ts` + `summary.ts` (sans pino) + `enrich.ts` (port-driven) +
`run.ts` (no persist, shared `LLMProvider`). The server owns persistence and adapter resolution —
same split as `reviewer-core` / `modules/reviews`.
