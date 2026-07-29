# Architecture Review — insight-core (proposed pure core package)

Scope: `insight-core/src/*.ts`, reviewed strictly for layering, dependency direction,
core purity, and ports & adapters. Benchmark: `reviewer-core`, whose package contract is
"pure logic … No DB/GitHub/FS; the only side effect is an injected LLMProvider"
(`reviewer-core/package.json`).

## Verdict

The package is advertised as a pure core like reviewer-core, but three of its five
implementation files perform hard-wired I/O. Only the LLM call follows the ports pattern
correctly. 4 findings.

## Findings

1. **store.ts:1-3 — Dependency rule violation (core → infrastructure).**
   The core imports `drizzle-orm` plus the server's `db/client` and `db/schema`.
   Dependencies must point inward; a standalone core package must not depend on another
   package's DB layer. Fix: delete `store.ts`; persistence is a server-side repository
   concern wired through the container.

2. **run.ts:41-42 — Persistence hard-wired into the engine.**
   `runInsights` calls `persistReport` itself, so the engine cannot run without touching
   the database. Distinct from finding 1: even with a correct adapter, the write does not
   belong inside the core flow. Fix: return the report and let the server's application
   service persist it — or inject an `InsightStore` port via `RunInsightsOptions`.

3. **enrich.ts:13-16 — Direct external I/O (GitHub API) inside the core.**
   `enrichWithOwnership` fetches `api.github.com` directly, embedding a concrete GitHub
   dependency and network I/O in the pure engine. Fix: accept an ownership port in
   `RunInsightsOptions` (like `llm`) and implement the GitHub call as a server adapter.

4. **summary.ts:1-4 — Infrastructure logging dependency in the core.**
   `pino` is imported and instantiated at module scope; logging is an infra side effect
   the pure core must not own (reviewer-core has no logger dependency). Fix: drop pino;
   surface the signal via the existing `onProgress` callback or an injected logger port.

## What is fine (not reported)

- `run.ts` defining `LLMProvider` as an interface and receiving it injected via
  `RunInsightsOptions` — correct ports-and-adapters usage, mirroring reviewer-core.
- `types.ts`, `prompt.ts` — pure data shapes and pure prompt assembly; no dependencies.
- The `onProgress` callback — an acceptable inversion for observability.
