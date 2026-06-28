# Development Plan: Smart Diff

## Context / Problem

The PR "Files changed" tab is a flat list — on a mega-PR the reviewer's eye lands on a lock-file as
easily as on business logic. **Smart Diff** reorders the diff by *risk*: `core` (business logic) on
top, `wiring` (config/index/entry), `boilerplate` (lock files, dist, snapshots) collapsed by default.
Flagged files get a clickable **"N findings"** badge that scrolls to the line, with per-line severity
markers. **Smart Diff is FREE — NO LLM call**: it deterministically composes already-persisted PR
files + the latest review's findings into the existing `SmartDiff` contract.

## Affected modules & layers

- **server/** — new `modules/smart-diff/` (constants + pure classifier = domain; service = application
  reading only via `container.reviewRepo`; route = presentation). Register in `modules/index.ts`.
- **client/** — new `lib/hooks/smart-diff.ts`; new `components/smart-diff-viewer/`; edit `DiffTab`.
- **vendor/shared** — NONE (the `SmartDiff` contract already exists; implement to it, do not change it).

## Data sources (both in Postgres, NO LLM)

- `container.reviewRepo.getPull(workspaceId, prId)` → PR row (404 if missing).
- `container.reviewRepo.getPrFiles(prId)` → `{path, additions, deletions, patch}[]`.
- `container.reviewRepo.reviewsForPull(prId)` → newest-first `{review, findings[]}[]`; `[0]` = latest.
  Finding row: `file`, `startLine`, `endLine`, `severity`.

## Contract (exists — `server/src/vendor/shared/contracts/brief.ts` ~L80-113, `SmartDiffResponse` re-exported `review-api.ts:64`)

`SmartDiffRole = core|wiring|boilerplate` · `SmartDiffFile {path, pseudocode_summary?(nullish),
additions:int, deletions:int, finding_lines:int[]}` · `SmartDiffGroup {role, files[]}` · `SmartDiff
{groups[], split_suggestion {too_big, total_lines, proposed_splits[{name, files[]}]}}`.

## Classifier (heart of acceptance) — `server/src/modules/smart-diff/`

`constants.ts` (SEPARATE constants file is an acceptance criterion):
- `SPLIT_TOO_BIG_LINES = 500`.
- `BOILERPLATE_PATTERNS` — **lock files ALWAYS boilerplate**: `package-lock.json`, `pnpm-lock.yaml`,
  `yarn.lock`, `npm-shrinkwrap.json`, `Cargo.lock`, `composer.lock`, `Gemfile.lock`, `poetry.lock`,
  `Pipfile.lock`, `go.sum`, `bun.lockb`; plus `**/dist|build|out|.next/**`, `*.min.js|css`,
  `**/__snapshots__/**`, `*.snap`, `**/generated/**`, `*.generated.*`, `*.map`, `**/vendor/**`.
- `WIRING_PATTERNS` — `*.config.*`, `tsconfig*.json`, `*.yml|yaml`, `**/.github/workflows/*`,
  `Dockerfile*`, `**/index.ts|tsx`, `server.ts`, `app.ts`, `package.json`.
- `ROLE_ORDER = ['core','wiring','boilerplate']`, `ROLE_LABEL`/`ROLE_CAPTION`.

`classify.ts` — pure `classifyFile(path): SmartDiffRole`, checked **boilerplate → wiring → core** (so a
`*-lock.json` never falls to the `*.json` wiring rule). No I/O / Fastify / Drizzle imports.

## Tasks

| # | Task | Module/Layer | Files | Required skills (in order) | Parallel group | Tests |
|---|------|--------------|-------|----------------------------|----------------|-------|
| 1 | Constants + pure `classifyFile` (boilerplate→wiring→core) | server / domain | `server/src/modules/smart-diff/constants.ts`, `classify.ts` (new) | onion-architecture → typescript-expert | SERVER-A | deferred |
| 2 | `SmartDiffService.getSmartDiff(workspaceId, prId)` — compose groups + finding_lines (latest review start-lines, one per finding) + split_suggestion; `pseudocode_summary:null`; omit empty groups; handle zero-review. **MUST NOT import `container.llm`/`@devdigest/reviewer-core`/`resolveFeatureModel`/`loadDiff`.** | server / application | `server/src/modules/smart-diff/service.ts` (new) | onion-architecture → typescript-expert | SERVER-A (after 1) | deferred |
| 3 | Route `GET /pulls/:id/smart-diff` → `SmartDiffResponse` (mirror `intent/routes.ts`, thin) + register | server / presentation | `server/src/modules/smart-diff/routes.ts` (new), edit `server/src/modules/index.ts` | fastify-best-practices → zod → onion-architecture | SERVER-A (after 2) | deferred |
| 4 | `useSmartDiff(prId)` hook (mirror `useIntent`) | client / lib | `client/src/lib/hooks/smart-diff.ts` (new) | frontend-architecture → react-best-practices | CLIENT-B | deferred |
| 5 | `SmartDiffViewer` + `SmartDiffGroup` + `SmartFileCard` + `FindingsBadge` + helpers — grouped/ordered, boilerplate collapsed, per-line severity markers, scroll-to-line. **Reuse** `diff-viewer/{parsePatch,CodeLine,styles.s,AUTO_EXPAND_MAX_LINES}`; **do NOT touch** `DiffViewer`/`FileCard`. | client / UI | `client/src/components/smart-diff-viewer/**` (new) | frontend-architecture → react-best-practices → next-best-practices | CLIENT-B (after 4) | deferred |
| 6 | Smart\|Original toggle in `DiffTab` (default smart); smart→`SmartDiffViewer`, original→existing `DiffViewer`; pass `usePrReviews` in | client / UI | edit `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx` | frontend-architecture → react-best-practices | CLIENT-B (after 4,5) | deferred |
| 7 | `SplitBanner` (when `split_suggestion.too_big`) | client / UI | `client/src/components/smart-diff-viewer/.../SplitBanner` (new) | frontend-architecture → react-best-practices | CLIENT-B (after 4) | deferred |

## Implementation sequence

SERVER-A (1→2→3) and CLIENT-B (4 → {5 ∥ 7} → 6) run in parallel (disjoint trees; contract already
exists). Then integrate + manual end-to-end verify against the real endpoint.

## Key design (resolves the tricky bits)

- **Scroll-to-line:** `SmartFileCard` wraps each diff line in `<div id={`diffline-${path}-${newNo}`}
  style={scrollMarginTop, position:relative}>` (id on the wrapper, `CodeLine` untouched). Lookup via
  **`getElementById`** (paths contain `/`/`.`). `SmartDiffViewer` owns `scrollTarget {path, line,
  nonce}`; badge click lifts it; the owning group AND file force-open; `useEffect([nonce])` →
  `scrollIntoView({block:'center'})` + highlight flash. Mirrors `ReviewRunAccordion`.
- **Per-line markers:** absolutely-positioned dot in the wrapper gutter, colour from `SEV_COLOR`
  (`FindingCard/constants.ts`), via `Map<newNo, Severity>` built from `reviews[0].findings` for that
  file (`f.file === path && f.start_line === newNo`). If alignment is fiddly, the ONLY allowed
  shared-component edit is an additive optional `marker?` prop on `CodeLine` (backward compatible).
- **Join:** `SmartDiffFile` has no `patch` → viewer joins server groups to `files: PrFile[]` by path.
- **Badge:** count = `file.finding_lines.length`; hidden when 0; colour = highest severity for the path.

## Known gotchas (from INSIGHTS)

- `fastify-type-provider-zod`: returned object must EXACTLY match `SmartDiffResponse` or it throws 500.
- Contracts live in server+client `vendor/shared` — NOT changed here (reuse only).
- `@testing-library/user-event` not installed (irrelevant — tests deferred).

## Risks / open questions

- Findings anchor to the NEW side only (`newNo === start_line`); deleted-only-line findings won't
  anchor (acceptable known gap).
- Large-PR: Smart/Original re-parse on toggle (MVP-acceptable; boilerplate collapsed avoids parsing
  huge lock files until expanded).

## Definition of Done

- `pnpm typecheck` green in `server/` + `client/`; no new model call when loading Smart Diff (DB-only).
- Lock-file always in collapsed Boilerplate group; badges clickable → scroll to line; thresholds in
  `constants.ts`; Smart order default; `split_suggestion` banner on large PRs. Tests deferred.
