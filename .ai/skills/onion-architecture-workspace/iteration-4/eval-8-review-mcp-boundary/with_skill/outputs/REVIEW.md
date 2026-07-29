# Architecture Review — mcp-boundary fixture

Standard applied: `onion-architecture` skill, especially **hard rule 8**: `mcp/` is a thin HTTP
client of the DevDigest REST API — it reaches DevDigest exclusively via HTTP (base URL from
`mcp/src/config.ts`), never imports `server/` code, never touches Drizzle/the DB, and holds no
domain logic. If the API lacks data an MCP tool needs, the fix is a new API endpoint, never a
shortcut into server internals.

## Findings (2)

### 1. `mcp/src/tools/get-conventions.ts` — direct DB access from mcp/ (lines 1–3)

The tool imports `drizzle-orm`, the server's `db/client`, and `db/schema`, then queries the
`repos` and `conventions` tables directly. This crosses the package boundary in the worst
direction: an out-of-process MCP tool reaching straight into server infrastructure, bypassing the
presentation and application layers entirely. Drizzle and the DB are infrastructure details owned
by `server/`; nothing outside `server/` may import them.

**Fix:** call the REST API through the shared `ApiClient`
(e.g. `GET /repos/:owner/:repo/conventions`), adding that endpoint to the server if it does not
exist yet.

### 2. `mcp/src/tools/get-findings.ts` — imports server Container + service (lines 1–2)

The tool imports the server's `Container` and `ReviewsService` and invokes the application layer
in-process instead of over HTTP. Two boundary breaches in one:

- `mcp/` importing `server/` code at all (rule 8);
- `new Container()` outside `server/src/platform/container.ts` — the composition root is the only
  place allowed to wire concretes, and it is a server-side concept that does not apply inside
  `mcp/`.

**Fix:** fetch the latest run's findings for the PR over HTTP via `ApiClient`, adding a REST
endpoint if the API does not expose it.

## Clean files

- `mcp/src/client.ts` — plain `fetch` wrapper with base URL from config: exactly the sanctioned
  pattern for `mcp/` (a raw fetch here is not a rule-3 violation; ports/adapters/Container do not
  apply inside `mcp/`).
- `mcp/src/config.ts` — env-driven config, the designated source of the API base URL.
- `mcp/src/tools/list-agents.ts` — reaches the API only through the injected `ApiClient`; the
  reference implementation the two offending tools should follow.
