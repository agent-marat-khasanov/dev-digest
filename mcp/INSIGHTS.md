# mcp/ — Engineering Insights

Module-specific, hard-won knowledge for the local MCP server. Read **What Doesn't Work** and
**Tool & Library Notes** first.

## What Works

- Reuse the shared Zod contracts **type-only** via a tsconfig path alias to
  `../server/src/vendor/shared` (tsconfig `moduleResolution: "Bundler"`, mirroring `server/`, so the
  contracts' `./contracts/*.js` specifiers resolve to `.ts`). The client `schema.parse()`es every API
  response with the same contracts (`Agent`, `PrMeta`, `Repo`, `ReviewRecord`, `Convention`,
  `RunSummary`, `ReviewRunResponse`), so an API shape drift fails loudly at the client boundary rather
  than surfacing as `undefined` deep in a mapper.
- Make the run-wait loop testable by injecting `sleep`/`now` into `waitForTerminal` — tests advance a
  fake clock (or use `runTimeoutMs: 0` for the immediate-timeout branch) with zero real delay and no
  fake-timer plumbing.

## What Doesn't Work

- Do NOT `console.log` anywhere in the server: the **stdio** transport uses **stdout** for JSON-RPC.
  Any stdout write corrupts the protocol and the client silently breaks. Send diagnostics to stderr.
- Do NOT alias `@devdigest/shared` to the `index.ts` **file** in `vitest.config.ts` (e.g.
  `new URL('../server/src/vendor/shared/index.ts', import.meta.url).pathname`). Alias to the shared
  **directory** via `path.resolve(__dirname, '../server/src/vendor/shared')` — exactly like
  `server/vitest.config.ts` — so Vite resolves the `.js`→`.ts` contract imports. The file-alias form
  can break `.js` specifier resolution.

- A **portable `tsx` bin** (e.g. `src/cli.ts` → `devdigest review`) can't rely on the
  `@devdigest/shared` **path alias at runtime**: tsx resolves tsconfig `paths` from the *cwd*, so the
  alias only works when cwd is `mcp/`. Running the bin from another repo throws
  `ERR_MODULE_NOT_FOUND: @devdigest/shared`. Fix: the CLI imports **types only** from
  `@devdigest/shared` (erased at transform) and talks to the API with a plain `fetch` — it does NOT
  import `client.ts` (which value-imports the Zod contracts). `src/index.ts` avoids this only because
  it's always launched with cwd=`mcp/` (`pnpm dev`/inspector).
- The stdout rule is **per-entry-point**: `src/index.ts` must keep stdout clean (JSON-RPC), but
  `src/cli.ts` is a normal command — stdout is its user-facing output. Diagnostics still go to stderr.
- **`.mcp.json` launches `src/index.ts` from the repo ROOT**, which re-triggers the same
  `@devdigest/shared` alias trap as the CLI note above (this **supersedes** its "index.ts is always
  cwd=`mcp/`" caveat — no longer true). `index.ts` value-imports `client.ts` → the Zod contracts, and
  tsx resolves tsconfig `paths` from cwd (root), not the entry file — so `tsx mcp/src/index.ts` from
  root throws `ERR_MODULE_NOT_FOUND: @devdigest/shared`. Fix in `.mcp.json`: pass
  `--tsconfig mcp/tsconfig.json` (paths then resolve relative to that tsconfig's dir) **and** point
  `command` at the package-local `mcp/node_modules/.bin/tsx` (no global tsx needed after `pnpm install`
  in `mcp/`). The README's old `claude mcp add … tsx mcp/src/index.ts` was silently broken for the same
  reason — fixed to include `--tsconfig`. Verified with a real `initialize` + `tools/list` handshake.

## Codebase Patterns

- The package is a **pure REST consumer**: no onion layers, no DB, no container. Untrusted
  `owner`/`repo`/`agent` are matched **in memory** against server-returned lists (`/repos`, `/agents`,
  `/repos/:id/pulls`); only server-issued **UUIDs** are interpolated into URL paths → no path
  injection. `pr_number` is validated as a positive int; `status` is an enum.
- `run_agent_on_pull_request` hides run→wait→fetch behind one call. `POST /pulls/:id/review` is
  fire-and-forget (returns `run_id`s + **empty** `reviews`), so poll `GET /pulls/:id/runs` until every
  target run's `status ∈ {done, failed, cancelled}` (the terminal set MUST include failed/cancelled or
  the wait hangs), then `GET /pulls/:id/reviews`. Verdict counts only `kind === 'review'` rows.

- **Startup wiring is split for testability + no side effects**: `config.ts` (`loadConfig(env)` —
  Zod-validated: `DEVDIGEST_API_URL` as `.url()`, `DEVDIGEST_RUN_TIMEOUT_MS` as coerced positive int,
  defaults baked into the schema; `safeParse` → one aggregated actionable error) → `server.ts`
  (`createServer(client)` — **pure** factory: build `McpServer` + register the 5 tools, NO
  transport/connect) → `index.ts` (thin entry: `loadConfig` → `new DevDigestClient(config)` →
  `createServer` → `connect(stdio)`; startup errors to **stderr** + `exit(1)`). `DevDigestClient` now
  takes the validated `Config` — no scattered `process.env` reads in the client.
- `compactAgent` returns `{ id, name, model, enabled }` — **no `provider`**: the tool spec doesn't need
  it and it's wasted tokens for the model. When trimming a compact-shape field, update the tool
  `description` and its unit test's expected object together.

## Tool & Library Notes

- **pnpm pre-run deps check can block `pnpm typecheck`/`pnpm test`** in some environments: a
  `runDepsStatusCheck` → `pnpm install` fails with `ERR_PNPM_IGNORED_BUILDS` (esbuild build scripts).
  Bypass by running the binaries directly: `./node_modules/.bin/tsc --noEmit -p tsconfig.json` and
  `./node_modules/.bin/vitest run`.
- MCP TS SDK high-level API: `new McpServer({name,version})` +
  `server.registerTool(name, {description, inputSchema, annotations}, handler)`, where `inputSchema` is
  a **raw `ZodRawShape`** (`{ key: z.string() }`), NOT a wrapped `z.object`. Handler returns
  `{ content:[{type:'text',text}], isError? }`. Connect via `await server.connect(new
  StdioServerTransport())`. Import subpaths: `@modelcontextprotocol/sdk/server/mcp.js` and
  `.../server/stdio.js`. `registerTool` exists only on newer 1.x — pinned `^1.19.0` (NOT verified in
  this repo yet; if install fails, `pnpm add @modelcontextprotocol/sdk@latest` and adapt).
- PR **auto-import** relies on `GET /repos/:id/pulls`, which only syncs **open + recently
  merged/closed** PRs from GitHub and needs a server-side `GITHUB_TOKEN`. There is **no**
  import-single-PR-by-number route, so an old closed PR outside that window will not resolve — the
  tool returns an actionable error, by design (light-variant scope).

## Open Questions

- `GET /pulls/:id/runs` status field is `status` on `RunSummary` (`trace.ts`) — re-confirm against
  `server/src/modules/reviews/repository.ts` `listRunsForPull` if the poll match-by-`run_id` breaks.
