# E2E INSIGHTS

## What Works

- Deterministic JSON flow specs — reliable CI, no flakiness from AI actions
- Hermetic mode (isolated Postgres) — specs never pollute dev DB

## What Doesn't Work

<!-- Dead ends and anti-patterns — the most valuable section, don't skip -->

- **`wait --text` asserts the RENDERED text, so `text-transform: uppercase` silently breaks it.**
  `SectionLabel` (`client/src/vendor/ui/primitives/SectionLabel.tsx`) uppercases its children, so
  the JSX `<SectionLabel>PR brief</SectionLabel>` must be asserted as `"PR BRIEF"`. Same for the
  tour TOC title. This produced a red suite whose message ("Command failed: wait --text PR brief")
  points at the assertion, not the cause, and the string is right there in the component — so the
  natural reaction is to disbelieve the failure. Prefer an accessibility hook when one exists:
  `find role navigation --name "On this page"` reads the `aria-label`, which no CSS can rewrite.
- **`wait --text` cannot see a `placeholder`** — it is an attribute, not text. `agent-browser` has
  a dedicated locator: `find placeholder "…" text`. The `find` verb's full locator set is
  `role, text, label, placeholder, alt, title, testid, first, last, nth` (`agent-browser find --help`),
  which is wider than this README documented for a long time.
- **`find text X click` never waits — and the suite shares ONE browser session.** Whether `X` has
  rendered when the click fires depends on what the *previous* flow left on screen, so the same
  missing-wait bug surfaces in a different flow every time you fix one. Diagnostic signature: the
  failure MOVES when you change unrelated flows. Always emit `wait --text X` immediately before
  `find text X click`; four flows were missing it.
- **A local `npm test` in `e2e/` is not the CI run.** Your dev DB has extra imported repos, so the
  home redirect lands on the wrong one and flows 02/04/05 fail for reasons CI will never see. Use
  `./scripts/e2e.sh` (ephemeral Postgres on alternate ports) — it reproduced CI's failures exactly,
  which is what made them fixable.

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
