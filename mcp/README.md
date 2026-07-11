# @devdigest/mcp — local MCP server

A local [Model Context Protocol](https://modelcontextprotocol.io) server that exposes DevDigest to an
MCP client (Claude Code, the MCP Inspector, …) over **stdio**. It is a **thin HTTP client of the
DevDigest REST API** — it holds no domain logic and no DB access. It defines 5 tools, translates
GitHub identifiers to DevDigest ids, and returns compact results.

## Tools

| Tool | Input (flat scalars) | Does |
|------|----------------------|------|
| `list_agents` | — | List configured review agents |
| `run_agent_on_pull_request` | `owner, repo, pr_number, agent` | Run a review on a PR and **block** until it finishes; returns `{ verdict, findings[] }` |
| `get_findings` | `owner, repo, pr_number` | Latest persisted `{ verdict, findings[] }` for a PR |
| `get_conventions` | `owner, repo, status?` | Extracted coding conventions for a repo |
| `get_blast_radius` | `owner, repo, pr_number` | **Stub** — not yet implemented |

`agent` is an agent name, or the literal `'all'` to run every enabled agent. `verdict` is
`{ status: 'pass' | 'blocked', score, counts: { critical, warning, suggestion } }`.

## Prerequisites

- The **DevDigest API must be running** — start it separately with `./scripts/dev.sh` (or
  `./scripts/dev.sh --no-client` for just Postgres + API on `:3001`). This MCP server is **never**
  started by the app scripts.
- For `run_agent_on_pull_request` / `get_findings` to resolve a PR: the repo must be registered in
  DevDigest (`POST /repos` or the Repositories UI), and a `GITHUB_TOKEN` + an LLM provider key must be
  configured server-side (`~/.devdigest/secrets.json`). Auto-import only covers open + recently
  merged/closed PRs.

## Env vars

| Var | Default | Meaning |
|-----|---------|---------|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | Base URL of the DevDigest REST API |
| `DEVDIGEST_RUN_TIMEOUT_MS` | `180000` | Max time `run_agent_on_pull_request` waits for a run to finish |

Both are validated with Zod at startup (`src/config.ts`) — a malformed URL or non-numeric
timeout fails fast with a clear message on stderr instead of a confusing mid-request error.

## Install

```sh
cd mcp && pnpm install
```

## Launch

A project-scoped **`.mcp.json`** at the repo root registers this server (`devdigest`) so a standard
MCP client (Claude Code) can connect it the standard way. It still only runs on demand — the client
spawns it when a session starts, and it does nothing until the DevDigest API is up.

The `.mcp.json` command runs from the **repo root**, so it passes `--tsconfig mcp/tsconfig.json`
(the `@devdigest/shared` path alias resolves relative to that tsconfig, not the root) and points at
the package-local `tsx` binary (no global install needed — just `pnpm install` in `mcp/` first).

```sh
# MCP Inspector (spawns the server over stdio + gives a UI):
pnpm inspector          # = npx @modelcontextprotocol/inspector tsx src/index.ts  (run from mcp/)

# …or register with Claude Code ad hoc for one session:
claude mcp add devdigest -e DEVDIGEST_API_URL=http://localhost:3001 \
  -- tsx --tsconfig mcp/tsconfig.json mcp/src/index.ts
```

## CLI — pre-push review (`devdigest review --mode working`)

A console command (same package) that reviews your **working tree** *before* `git push`:

```sh
# from any repo checkout, with the DevDigest API running:
tsx mcp/src/cli.ts review --mode working          # or: (cd mcp && pnpm review -- --mode working)
devdigest review --mode working [--agent <name>]  # via the package bin
```

It runs `git diff` (uncommitted changes in the current repo), POSTs the raw diff to
`POST /review/working`, and prints the structured findings. The server reviews it with the **same
product agent + engine** that reviews PRs (`reviewPullRequest` in reviewer-core) — a different entry
point, identical reviewer. `--mode working` is the only mode today (room left for `staged` / `branch`).

Requires the API running and an LLM key configured server-side (`~/.devdigest/secrets.json`).

## Develop

```sh
pnpm typecheck          # tsc --noEmit
pnpm test               # vitest run (unit tests, mocked fetch — no API/DB needed)
```

## Security note

Untrusted `owner` / `repo` / `agent` strings are only ever **matched in memory** against
server-returned lists; only server-issued UUIDs are placed into URL paths. `pr_number` is validated
as a positive integer and `status` is constrained to an enum. The server holds no secrets — it relies
on the DevDigest API's local no-auth mode and the server-side `GITHUB_TOKEN`.
