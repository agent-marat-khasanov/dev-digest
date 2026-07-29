# Architecture Review — mcp-boundary fixture

Standard applied: onion-architecture skill snapshot (iteration 4) + project architecture map,
which defines `mcp/` as a **thin HTTP client of the server's REST API** — it owns no database,
no server internals, and reaches DevDigest only over HTTP.

## Findings (3)

### 1. `mcp/src/tools/get-conventions.ts:1-3` — direct DB access across the package boundary
The tool imports `drizzle-orm`, the server's `db/client`, and `db/schema`, then runs SQL queries
itself (lines 13–19). This bypasses the REST boundary and every server ring — no route, no
service, no repository — going straight from a foreign package into infrastructure. It also
forces the mcp process to hold a Postgres connection and duplicates workspace/repo query logic
outside `server/`.

**Fix:** expose (or reuse) a conventions REST endpoint and fetch it through `ApiClient`;
the Drizzle query belongs in a server `repository.ts`.

### 2. `mcp/src/tools/get-findings.ts:1-2` — importing server application layer + Container
`ReviewsService` and `Container` are server internals. Importing them in-process couples mcp to
the server's application layer, DB wiring, and secrets, instead of the server's public HTTP
contract. The dependency direction for an external package is: HTTP edge only.

**Fix:** call the reviews REST endpoint via `ApiClient` and map the JSON to `FindingSummary`.

### 3. `mcp/src/tools/get-findings.ts:11-12` — composing concretes outside the composition root
`new Container()` + `new ReviewsService(container)` wires server concretes inside an mcp tool.
`server/src/platform/container.ts` is the *only* sanctioned composition root; a per-call
Container in a foreign package is an ad-hoc second root (and re-bootstraps the whole dependency
graph on every tool invocation).

**Fix:** falls away once finding 2 is fixed — a REST client constructs no server objects.

## Clean files

- `mcp/src/client.ts` — plain fetch wrapper over the REST API: exactly what the mcp boundary
  prescribes.
- `mcp/src/config.ts` — env parsing with Zod, local to the package. Fine.
- `mcp/src/tools/list-agents.ts` — consumes the REST API through the injected `ApiClient`.
  This is the reference pattern the other two tools should follow.
