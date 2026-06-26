# Client INSIGHTS

## What Works

- TanStack Query hooks wrapping apiFetch — clean separation of data fetching from UI
- Server Components by default, "use client" only when necessary
- `format-cost.ts` with tiered precision: null → "—", < $0.01 → 4 decimals (so cheap runs like $0.0013 read as non-zero), ≥ $0.01 → 3 decimals — handles edge cases cleanly without per-component formatting

## What Doesn't Work

- Do NOT alias intra-feature co-location imports. A sub-component importing its route's `../../constants` | `../../styles` | `../../helpers` (e.g. `PRRow.tsx` → `../../constants` = `pulls/constants.ts`) is the INTENDED pattern per frontend-architecture; rewriting these to `@/app/...` aliases is verbose, brittle to route renames, and wrong. Only alias imports that ESCAPE the feature into shared infra (`lib/`, `components/`, `messages/`).
- `position: absolute` popovers inside `tableCard` (`styles.ts`) get clipped — the card has `overflow: hidden` for clean border-radius. Use `position: fixed` + `getBoundingClientRect()` instead (see `FindingsPopover.tsx`). The Dropdown in `vendor/ui` works with absolute because it's never nested inside an overflow-hidden container

## Codebase Patterns

<!-- Conventions and architectural decisions -->

- All data fetching via hooks in src/lib/hooks/ — never raw fetch() in components
- vendor/ui/ is read-only vendored design system
- vendor/shared/ must stay in sync with server/src/vendor/shared/
- When shared contracts gain a new field, ALL test mocks must include it — even as `null` for backward compat (e.g. `RunSummary`, `RunTrace` mocks in RunHistory.test.tsx, RunTraceDrawer.test.tsx, contracts.test.ts)
- Path-alias convention enforced by `src/test/architecture.test.ts` (a vitest guard, not ESLint — the repo deliberately ships zero ESLint and uses vitest guard tests like `server/test/contracts.test.ts`). It fails on any `"(../)+(lib|components|messages)/` import under `src/` (excluding `vendor/`). Reach shared infra via `@/lib`, `@/components`, `@messages` — never `../`.
- `@messages/*` alias (messages live in `client/messages/`, OUTSIDE `src/`, so `@/` can't reach them) must be declared in BOTH `tsconfig.json` paths AND `vitest.config.ts` resolve.alias, or tests fail to resolve message JSON.
- `vi.mock("...")` paths must use the SAME alias as the component's real import — rewrite mock paths alongside imports so the mocked module ID matches.
- The `client` copy of `vendor/shared/contracts/*` can DIVERGE from the `server` copy (the client `knowledge.ts` was missing the `AgentVersion`/`AgentVersionConfig` contracts and some comments). When porting a contract change, apply ONLY the targeted edit to the client copy (same `Edit` old/new string) — do NOT overwrite the file from the server copy, or you drag unrelated drift into the diff.
- Add a new repo-scoped Skills Lab page by reading the active repo from `useActiveRepo()` (`@/lib/repo-context` → `{ repoId, activeRepo }` with `activeRepo.full_name`/`default_branch`); the nav entry goes in `vendor/ui/nav.ts` (between Skills and Agents), and `components/app-shell/helpers.ts` `activeKeyFor()` already maps `/conventions`. Build GitHub evidence links with `githubBlobUrl(repoFullName, branch, file, line)` from `@/lib/github-urls`.

## Tool & Library Notes

<!-- Quirks and gotchas of dependencies -->

- next-intl is wired but not actively used in starter — messages/en.json is the source
- NEXT_PUBLIC_API_BASE controls API URL (default http://localhost:3001)
- `@testing-library/user-event` is NOT installed — component tests use `fireEvent` from `@testing-library/react` (see `SkillCard.test.tsx`). For inline-edit-on-Enter: `fireEvent.click(span)` → `fireEvent.change(input, { target: { value } })` → `fireEvent.keyDown(input, { key: "Enter" })`
- next-intl in component tests: wrap with `<NextIntlClientProvider locale="en" messages={{ <namespace>: messages }}>` where `messages` is `import x from "@messages/en/<namespace>.json"`. The namespace key must match the `useTranslations("<namespace>")` call
- `vendor/ui` primitives: `ProgressBar` `value` is 0–100 (auto-clamped), takes a `color`; `Toggle` props are `on`/`onChange` and it renders `role="switch"`; `Textarea` has NO `readOnly` prop — for a read-only preview use a controlled `value` + no-op `onChange={() => {}}`; `CategoryTag` only accepts a fixed `Category` enum (no free-form children) — use `Badge` with children for arbitrary labels
- JSX text with interpolation (`{label} {n}%`) splits into separate text nodes, so `getByText(/90%/)` fails. Match with a function matcher scoped to the element: `getByText((_, el) => el?.tagName === "SPAN" && el.textContent === "Confidence 90%")`
- `vendor/ui` `Badge` has **no `onClick`** — for a clickable badge, wrap it in `<button type="button">` with reset styles (`all: "unset"`) and `e.stopPropagation()` if it sits inside another clickable row (e.g. a collapsible file header). The `Icon` registry is a typed `IconName` union — `FileCode`/`Code2` are NOT in it (compile error); use `FileText` for file/empty-state icons.
- **Don't import a route's `_components/` into shared `components/`** — reaching from `client/src/components/**` up into `client/src/app/**/_components/**` is a layering violation (route-private → shared). Duplicate the tiny constant locally instead. Hit this with `SEV_COLOR` (lives in `pulls/[number]/_components/FindingCard/constants.ts`): the shared `smart-diff-viewer` re-declares its own identical copy rather than importing upward.
- To scroll to a diff line by id, use **`document.getElementById`, NOT `querySelector`** — diff line ids embed the file path (`diffline-${path}-${newNo}`) which contains `/` and `.` (CSS-special). Defer the `scrollIntoView` one tick (`setTimeout 50ms`) so a just-opened collapsed file/group finishes its re-render first; use `scrollMarginTop` on the line wrapper to clear the sticky header.
- The vendored `<Markdown>` primitive (`vendor/ui/primitives/Markdown.tsx`) only inlines styles for `p`/`strong`/`code`/`a`; it renders `h1-3`/`ul`/`ol`/`li`/`blockquote`/`hr` with NO styling. Tailwind preflight + the design-system reset (`vendor/ui/styles.css:205-211` zeroes heading margins; preflight strips list bullets) then make them render flat — headings look like body text, lists lose bullets. Fix WITHOUT editing vendor: the primitive sets `className="dd-md"`, so style `.dd-md h1/ul/li/...` in `app/globals.css` (done). Affects all 5 consumers: PreviewTab, FindingCard, CommentCard, BodyEditor, Showcase

## Recurring Errors & Fixes

<!-- Recurring errors + fix -->

## Session Notes

### 2026-06-22 — Conventions Extractor page
- New `/conventions` page (`app/conventions/page.tsx` → `_components/ConventionsView/`) with `ConventionCard` + `CreateSkillModal` sub-components; hooks in `lib/hooks/conventions.ts` (added to the barrel). Accept/reject is an optimistic `useUpdateConvention` (onMutate snapshots, onError rolls back). Mirrors `SkillsListView` structure
- The page is repo-scoped but the route is `/conventions` (no `:repoId`) — it reads `useActiveRepo()` like other repo-aware Skills Lab pages. Confidence bar colors: `--ok` ≥80%, `--warn` 50–79%, `--crit` <50%
- The create-skill body is regenerated server-side from accepted conventions; the modal shows a live preview via a client `buildSkillBodyPreview` that mirrors the server's `buildSkillBody` (description is interpolated into the intro, so editing it updates the preview)

### 2026-06-22 — Skill Evals tab
- The skill detail tabs (`SkillDetail.tsx`) were already wired for `evals` (tab key + `FlaskConical` icon + a placeholder `EvalsTab`); implementing the tab = replace the placeholder body AND pass the missing `skill` prop in `SkillDetail.tsx` (`<EvalsTab skill={skill} />`)
- To know which row a single shared mutation is acting on, use TanStack's `mutation.variables` (the arg passed to `.mutate(id)`) alongside `mutation.isPending` — e.g. `runOne.isPending && runOne.variables === c.id`. Avoids per-row mutation instances or extra state
- `@devdigest/ui` `Button` has a `loading` prop that swaps the icon to a spinning `RefreshCw`; `Badge` takes `color`/`bg` (CSS vars) + `mono`. Severity CSS vars: `--crit`/`--crit-bg`, `--warn`/`--warn-bg`, `--sugg`/`--sugg-bg`, plus `--ok` (green). No `Circle` icon in the registry — render a hollow status dot with a bordered `<span>`
- This repo styles via co-located `styles.ts` inline-style objects with CSS vars (see `StatsTab`, `SkillCard`), NOT Tailwind — follow the existing convention even though generic React guidance prefers utility classes

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
- Two popover data strategies depending on context: PR list uses lazy-fetch (`usePrReviews(show ? prId : null)`) because reviews aren't loaded on the list page. Agent runs timeline reuses already-loaded `ReviewRecord[]` passed via prop from FindingsTab — no extra fetch needed. When the parent already has the data, prefer passing it down over re-fetching

### 2026-06-21 — Frontend path-alias cleanup (frontend-architecture audit)
- Audited `client/` against the frontend-architecture skill. Structure was already largely compliant (folder-per-component + barrels, single `lib/api.ts` network boundary, domain-split hooks). The one pervasive violation: 64 deep relative imports (`../../../../lib/...`) across ~40 files instead of `@/` aliases (skill rule 6).
- Fixed mechanically with perl: `s{"(\.\./)+lib/}{"@/lib/}` (+ components, messages). Added `@messages/*` alias to tsconfig + vitest. Moved `lib/feature-models.ts` → `SettingsModels/constants.ts` (used by ONE component, so per the placement ladder it doesn't belong in `lib/`).
- Moved `RunTraceDrawer/_components/atoms.tsx` into `TraceBody/` (its sole consumer) — did NOT split the trivial `Stat`/`Row` atoms into folder-per-component, because the skill explicitly says don't over-abstract trivial one-off presentational atoms.
- LEFT hard-coded hex colors in `AgentCard/constants.ts` (per-model chip colors) and `diff-viewer/comments.ts` (`#fff`): no semantic design-system token exists for them and adding one means editing do-not-touch `vendor/ui`. Changing them = no value + visual-drift risk.

## Open Questions

<!-- What remains unresolved -->
