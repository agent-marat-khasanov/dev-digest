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

## Tool & Library Notes

<!-- Quirks and gotchas of dependencies -->

- agent-browser is a Rust CLI binary — first run downloads Chrome for Testing (slow)

## Recurring Errors & Fixes

<!-- Recurring errors + fix -->

## Session Notes

<!-- Dated session summaries — add after each significant session -->

## Open Questions

<!-- What remains unresolved -->
