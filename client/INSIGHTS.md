# Client INSIGHTS

## What Works

- TanStack Query hooks wrapping apiFetch — clean separation of data fetching from UI
- Server Components by default, "use client" only when necessary
- `format-cost.ts` with tiered precision: null → "—", < $0.01 → 4 decimals (so cheap runs like $0.0013 read as non-zero), ≥ $0.01 → 3 decimals — handles edge cases cleanly without per-component formatting

## What Doesn't Work

- `position: absolute` popovers inside `tableCard` (`styles.ts`) get clipped — the card has `overflow: hidden` for clean border-radius. Use `position: fixed` + `getBoundingClientRect()` instead (see `FindingsPopover.tsx`). The Dropdown in `vendor/ui` works with absolute because it's never nested inside an overflow-hidden container

## Codebase Patterns

<!-- Conventions and architectural decisions -->

- All data fetching via hooks in src/lib/hooks/ — never raw fetch() in components
- vendor/ui/ is read-only vendored design system
- vendor/shared/ must stay in sync with server/src/vendor/shared/
- When shared contracts gain a new field, ALL test mocks must include it — even as `null` for backward compat (e.g. `RunSummary`, `RunTrace` mocks in RunHistory.test.tsx, RunTraceDrawer.test.tsx, contracts.test.ts)

## Tool & Library Notes

<!-- Quirks and gotchas of dependencies -->

- next-intl is wired but not actively used in starter — messages/en.json is the source
- NEXT_PUBLIC_API_BASE controls API URL (default http://localhost:3001)

## Recurring Errors & Fixes

<!-- Recurring errors + fix -->

## Session Notes

### 2026-06-18 — Run Cost Badge
- Added `cost_usd` to RunTrace/RunSummary/PrMeta Zod contracts in `vendor/shared/`
- Created `format-cost.ts` utility: null-safe, precision-tiered USD formatter
- Cost badge rendered in three places: PRRow (list), RunHistory (run summary), RunTraceDrawer (trace stats)
- `PrMeta.cost_usd` is aggregated server-side; client just displays it
- i18n labels added to `messages/en/prReview.json` and `messages/en/runs.json` for the COST stat

### 2026-06-18 — Findings Severity Badges
- PR list grid expanded from 7 to 8 columns (GRID constant in `constants.ts`). COLUMN_KEYS array order must match GRID template and the header/row rendering order exactly — misalignment silently misplaces column content
- `SeverityBadge` from `vendor/ui` supports `compact` prop (icon + count only, no label text) — ideal for inline/table use. Import it alongside other Badge variants
- RunHistory fallback: when `sev_*` fields are null (pre-migration runs), falls back to the plain-text "X finding(s)" display. New fields are checked via `!= null` rather than truthiness to distinguish 0 from null
- Adding new nullable fields to shared contracts (`RunSummary`, `PrMeta`) requires updating ALL test mock factories that spread partial overrides — TypeScript strict catches missing required fields in the factory defaults (e.g. `RunHistory.test.tsx` run() factory needed `sev_critical: null` etc.)

### 2026-06-18 — Findings Hover Popover
- Hover popover pattern for PR list: no Radix/Floating UI in the project — use `position: fixed` with `getBoundingClientRect()` for coordinates, NOT `position: absolute`. Close with a 150ms `setTimeout` delay on `mouseLeave` to prevent flicker when cursor moves between trigger and popover
- Lazy data fetch on hover: pass `null` to `usePrReviews(show ? prId : null)` — TanStack Query's `enabled: !!prId` skips the fetch until hover triggers. Once fetched, the cache keeps it instant for subsequent hovers
- `onClick={e => e.stopPropagation()}` on the popover is essential — PRRow is a clickable row that navigates on click, and the popover sits inside it. Without stopPropagation, clicking a finding card navigates away
- `vendor/ui` exports `ConfidenceNum` and `CategoryTag` alongside `SeverityBadge` — all three are useful for compact finding summaries in popovers/tooltips

## Open Questions

<!-- What remains unresolved -->
