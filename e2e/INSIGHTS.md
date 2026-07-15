# E2E INSIGHTS

## What Works

- Deterministic JSON flow specs — reliable CI, no flakiness from AI actions
- Hermetic mode (isolated Postgres) — specs never pollute dev DB

## What Doesn't Work

<!-- Dead ends and anti-patterns — the most valuable section, don't skip -->

## Codebase Patterns

<!-- Conventions and architectural decisions -->

- Never use agent-browser "chat" command — always use --url, --text, --selector
- Specs are numbered for consistent execution order
- Project Context flows (`08-project-context`) need REAL FILES on disk, not just DB rows — discovery
  walks the repo clone. The seeded demo repo's `clonePath` now points at
  `server/fixtures/demo-context-docs/{specs,docs,insights}` (wired in `server/src/db/seed.ts`);
  before that it was `null` and every context surface rendered empty. Any new context-doc assertion
  must match those fixture files' content.
- Doc discovery sorts by `path.localeCompare` over the whole tree, so fixture order is alphabetical
  by top segment (`docs/*` < `insights/*` < `specs/*`) — "click the first Preview button"-style
  selectors depend on this order.
- Editor tab switches (`/agents/[id]?tab=…`, `/skills/[id]?tab=…`) use `router.replace` with a
  `?tab=` param — `wait --url tab=<key>` is the reliable "tab switched" assertion (same as
  04-pr-findings).
- `run.ts` discovers specs via `readdirSync(SPECS_DIR)` — adding a new `NN-*.flow.json` needs no
  runner/registry change (only the README coverage table).

- The hermetic seed writes NO `repo_index_state` row for the demo repo, so every repoIntel-facade
  feature resolves `getIndexState` → `{status:'degraded', degradedReason:'no_data'}` in e2e. A flow
  asserting a facade-backed feature must assert its DEGRADED presentation (e.g. onboarding tour =
  skeleton + "no_data" badge, `10-...`), unless the seed first inserts a real index-state row.
- LLM-backed features WITHOUT a deterministic fallback (e.g. PR brief — model failure = 5xx by
  design, unlike onboarding's skeleton) can only reach their ERROR state in the key-less hermetic
  stack: `container.llm(provider)` throws `ConfigError` (500) synchronously before any network call.
  Write the flow to assert the honest error/EmptyState + Retry + "rest of page still renders", and
  delegate success-path ACs to integration/RTL — an honest error assertion beats a fake success.
- Client query retry default is `retry: 1` (`client/src/lib/providers.tsx`), so error states settle
  within one retry+backoff — `wait --load networkidle` windows cover it, no special handling.
- Flow numbering: take the next free `NN-` slot across ALL branches about to merge — `05` was free on
  one branch but taken on another (onboarding took 09 for the same reason); a stale plan number is
  renumbered at implementation time, only the README coverage table needs the row.

## Tool & Library Notes

<!-- Quirks and gotchas of dependencies -->

- agent-browser is a Rust CLI binary — first run downloads Chrome for Testing (slow)
- agent-browser is NOT installed in implementer worktrees or the main dev shell — new flows are
  validated structurally (JSON.parse + `Flow`/`Step` shape from `lib/assert.ts`) and run for real
  only via `./scripts/e2e.sh` where the binary exists. Report structural-only validation honestly.

## Recurring Errors & Fixes

<!-- Recurring errors + fix -->

## Session Notes

<!-- Dated session summaries — add after each significant session -->

## Open Questions

<!-- What remains unresolved -->
