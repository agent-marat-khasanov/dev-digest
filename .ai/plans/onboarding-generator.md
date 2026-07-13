# Implementation Plan: Onboarding Generator

**Spec:** `specs/SPEC-02-onboarding-generator-2026-07-12.md` | **Spec ID:** SPEC-02 | **Status at planning time:** approved
**Execution mode:** multi-agent

> **Revision note (post cross-review, GPT-5.2 → REQUEST CHANGES):** this plan was revised to resolve five
> blocking issues. Task IDs are stable. Summary of what changed: (1) server routes kept as `/repos/:id/tour`
> with an explicit justification note; (2) markdown-authored links are neutralized (AC-7/AC-21); (3) the model
> output schema now carries **structured** `{path,role}` / `{path,why}` items so every clickable path is
> validate-able; (4) run commands are **code-derived**, excluded from the model schema (AC-8); (5) the concrete
> "Open" behavior is specified against the existing in-app file viewer (AC-4). See `.ai/plans/onboarding-generator.cross-review.md`.

> Scope note: this feature is almost entirely **pre-scaffolded**. Do NOT create new stubs — **extend**
> the existing ones (server INSIGHTS: "grep the schema + contracts + feature-models + messages BEFORE
> creating anything — extend the stubs, don't duplicate"):
> - Contract stubs `Onboarding` / `OnboardingSection` / `OnboardingLink` already exist in
>   `server/src/vendor/shared/contracts/knowledge.ts:28-47` (+ client mirror).
> - Table `onboarding` already exists — `server/src/db/schema/context.ts:120-125` (`repo_id` PK, `json`
>   jsonb, `generated_at`).
> - `'onboarding'` feature-model already registered — `contracts/platform.ts:43-50` (default
>   `openrouter` / `deepseek/deepseek-v4-flash`); resolve via `resolveFeatureModel(container, ws, 'onboarding')`.
> - Prompt file already drafted — `server/src/prompts/onboarding.system.md` (needs the `routes_and_apis`
>   reconciliation, AC-6/NG6).
> - `activeKeyFor` already returns key `"onboarding-tour"` — `client/src/components/app-shell/helpers.ts`.
> - `MermaidDiagram` (`client/src/components/mermaid-diagram/`) and `react-markdown` already exist for AC-21.
> - In-app **file viewer** already exists — `GET /repos/:id/file?path=` → `RepoFileContent`, hook
>   `useRepoFile` (`client/src/lib/hooks/repo-file.ts`), overlay `CodeViewer` (BlastPanel). This is the AC-4 "Open" target.

## Acceptance criteria (from the spec)

| AC | Criterion (intent) | Verify | Covered by task(s) |
|----|--------------------|--------|--------------------|
| AC-1 | Factual inputs assembled from deterministic sources, **zero** model calls for facts (facade methods + clone manifest for scripts — see API note) | integration | T4, T11 |
| AC-2 | Guided reading path ordered by import-graph file rank (getTopFilesByRank), not alphabetical/path/date | unit | T4, T10 |
| AC-3 | WHILE hotness=0 (shallow clone), reading-path rank == pure PageRank; no non-zero hotness dependency | unit | T4, T10 |
| AC-4 | Critical paths list files from getCriticalPaths / top-ranked, each with a one-line role + Open target to a **real indexed path** (rendered only from validated structured items; opens via the in-app file viewer) | integration | T4, T5, T9, T11 |
| AC-5 | Five sections produced with **exactly one** completeStructured call, model via resolveFeatureModel('onboarding') | integration | T5, T11 |
| AC-6 | Exactly the five mandatory sections (`architecture`,`critical_paths`,`run_locally`,`reading_path`,`first_tasks`) in fixed order, stable ids, **no** `routes_and_apis` (routes folded into architecture) | unit | T1, T3, T5, T10 |
| AC-7 | Every model-emitted path (structured items + any body links) validated against gathered facts; unknown path → not clickable | unit | T4, T9, T10, T12 |
| AC-8 | "How to run locally" commands **derived deterministically by code** from real scripts/setup facts (not model-authored); copy-only (no auto-exec) | integration | T4, T5, T11 |
| AC-8a | `first_tasks` = pure model narrative grounded only in already-gathered facts; no extra fact-gathering | integration | T4, T5, T11 |
| AC-9 | IF index degraded/failed or degradedReason set (incl. `repo_too_large`) → deterministic skeleton from facts, NO model call | integration | T4, T5, T11 |
| AC-10 | Skeleton shows honest "generated without model" badge naming the reason; never empty/error page | e2e (05-onboarding-tour) | T5, T9, T13 |
| AC-11 | IF completeStructured fails/times out → skeleton fallback with failure reason, not a client error | integration | T5, T11 |
| AC-12 | IF never cloned (`repo.clonePath == null`) → deterministic `not_available` + reason `not_cloned`, no 500, no skeleton; page shows "sync this repo" CTA | integration | T5, T9, T11 |
| AC-13 | Facts gathered within facade fixed budgets regardless of repo size; NO generator-specific size threshold | unit | T4, T10 |
| AC-14 | Page renders 5 cards + "On this page" TOC; header shows "Onboarding for <repo>", files-indexed count, last-refreshed from **cached tour's generated_at** (not index updatedAt) | e2e (05-onboarding-tour) | T1, T5, T9, T13 |
| AC-15 | Regenerate re-runs generation for the current indexed SHA, replaces cached + displayed tour | e2e (05-onboarding-tour) | T5, T8, T9, T13 |
| AC-16 | WHILE generating → loading state (not blank); on complete → swap in result | unit (RTL) | T9, T12 |
| AC-17 | run_locally = ordered list, each command individually copyable; reading_path = numbered file list, each with its "why read this" one-liner | unit (RTL) | T9, T12 |
| AC-18 | On model generation, record cost in **USD** (StructuredResult.costUsd) in the structured server log, alongside tokens in/out + model | integration | T5, T11 |
| AC-19 | IF costUsd is null → log cost as null, do NOT fail generation | unit | T5, T10 |
| AC-20 | Untrusted repo blocks (facts/tree/excerpts) delimiter-wrapped + declared data-not-instructions in the prompt | unit | T3, T4, T10 |
| AC-21 | Model narrative rendered as untrusted: markdown w/o raw HTML/script, **markdown-authored links neutralized**, mermaid script-safe, clickables only from validated structured items; no model string reaches DOM as executable HTML or unvalidated href/src | unit (RTL) | T9, T12 |
| AC-22 | Every repo/index query scoped by `workspace_id` (IDOR-safe, RepoRepository.getById pattern) | integration | T5, T11 |
| AC-23 | Cached tour for current indexed SHA → return without model call; completeStructured only on cache miss or explicit Regenerate (intent getIntent/recalculate split) | integration | T2, T5, T11 |
| AC-24 | IF indexed SHA changes → subsequent request is a cache miss for the new SHA and regenerates (no stale serve) | integration | T2, T5, T11 |
| AC-25 | On model generation, **persist** cost_usd (USD) + token counts alongside the cached tour; endpoint exposes `generated.cost_usd` + tokens | integration | T1, T2, T5, T11 |

**Non-goals honored as hard scope boundaries:** NG1 (no churn/hotness revival — reading path is pure
PageRank), NG2 (no new indexing/graph/facade **methods**, pipeline steps, or tables; read-only facade
consumer; no generator huge-repo threshold), NG3 (single-repo scope), NG4 (no in-app narrative editing),
NG5 (no Share link), NG6 (no standalone `routes_and_apis` section). No task below adds any of these.

## Affected modules & layers

- **server/** — new `modules/onboarding/` (Application `service.ts`, Infrastructure `repository.ts` + pure
  helpers `facts.ts`/`sections.ts`/`prompt.ts`, Presentation `routes.ts`), Composition root touch = one entry
  in `modules/index.ts`. DB schema extension + migration (`db/schema/context.ts`). Prompt file
  `src/prompts/onboarding.system.md`. Reuses the `repoIntel` facade port, `resolveFeatureModel`,
  `container.llm(provider)`, `container.repoRepo`, and `resolveInClone`/`MAX_FILE_SIZE` for the manifest read.
- **server/src/vendor/shared/** — extend `contracts/knowledge.ts` (domain contracts).
- **client/** — new `app/tour/` page + `_components/TourView/`, `lib/hooks/onboarding.ts`, nav
  (`vendor/ui/nav.ts`) + shell helper (`components/app-shell/helpers.ts`). RSC boundary: page is a thin Server
  Component shell; `TourView` is `"use client"`. Reuses `useRepoFile` + `CodeViewer` for Open. Mirror
  `vendor/shared/contracts/knowledge.ts`.
- **e2e/** — new `05-onboarding-tour` flow (LLM stubbed per the existing hermetic harness convention).
- **reviewer-core/** — **not touched** (narrative generation stays server-side; reviewer-core stays pure —
  see Recommendations).

## Data model changes

Extend the **existing** `onboarding` table (`server/src/db/schema/context.ts:120-125`) — it is empty, so
altering it is safe. Add **nullable** columns only (no drops → `drizzle-kit generate` stays non-interactive;
nullable avoids the `.notNull()`-without-default typecheck break noted in server INSIGHTS):

| Column | Type | Null | Purpose |
|--------|------|------|---------|
| `sha` | `text` | yes | indexed SHA the cached tour was generated for (cache key, AC-23/AC-24) |
| `model` | `text` | yes | model used (AC-25) |
| `cost_usd` | `doublePrecision` | yes | persisted USD cost; null when provider reports none (AC-25, AC-19) |
| `tokens_in` | `integer` | yes | persisted tokens in (AC-25) |
| `tokens_out` | `integer` | yes | persisted tokens out (AC-25) |

- Keep the existing `json` jsonb column as the persisted tour body (`TourSection[]` + `mode`/`reason`);
  keep `repo_id` PK (one cached tour per repo, replaced on SHA change / Regenerate — mirrors intent's per-PR
  row keyed by prId with a stored `headSha`). Keep `generated_at` (drives header last-refreshed, AC-14).
- Only `skeleton`/`model` tours are cached; `not_available` is computed per request, never persisted.
- `db:generate` then review SQL before `db:migrate` (migrations are manual, per server/CLAUDE.md).

## API contracts

Reconcile the **pre-scaffolded** `Onboarding*` stubs in `contracts/knowledge.ts` into the spec's field
tables (extend in place — do NOT add a parallel `onboarding.ts` file, do NOT leave the old `kind: string` shape):

- **`OnboardingTour`** (endpoint response): `repo_id`, `mode` enum `model|skeleton|not_available`,
  `reason` `string|null`, `sections: TourSection[]`, `index: { files_indexed:int, sha:string|null }`,
  `generated_at: string|null` (ISO), `generated: { model:string|null, cost_usd:number|null, tokens_in:int|null,
  tokens_out:int|null }` nullish.
- **`TourSection`** (transport): `id` = fixed ordered enum `architecture|critical_paths|run_locally|reading_path|first_tasks`
  (rename the stub's `kind: string`), `title`, `body` (markdown), `diagram: string|null` (architecture only),
  `links: { label, path }[]` (each `path` validated per AC-7 — used for **all** clickables: critical-path Open
  targets carry `label`=role, reading-path entries carry `label`="why read this", architecture may carry a few),
  `commands: string[]` (run_locally only; **code-derived**, see below).
- **Model output schema** (in `prompt.ts`, used by `completeStructured` — DISTINCT from the transport shape;
  wraps as `z.object({...})` because tool-use requires an object root):
  - `architecture: { body, diagram }`
  - `critical_paths: { body, items: { path, role }[] }`
  - `reading_path: { body, items: { path, why }[] }`
  - `first_tasks: { body }`  (pure narrative, AC-8a)
  - `run_locally: { body }`  — **no `commands` field**; the model never authors commands (AC-8).
  The service maps `items[]` → transport `links[]` (`label`=role/why, `path`=path) after validation, and sets
  `run_locally.commands` from the code-derived set. This guarantees every clickable path is a structured,
  validate-able value — never parsed out of markdown (resolves cross-review Blocking #2/#3).
- **Run commands are deterministic, not model-authored (AC-8).** No facade method exposes scripts (verified:
  `getRepoMap` returns a symbol-signature skeleton only — `repo-intel/pipeline/repo-map.ts` `renderRepoMap`;
  the facade has no `getScripts`/`getStack`). So `facts.ts` reads the repo's **manifest from the clone**
  (`repo.clonePath` + `resolveInClone` guard + `MAX_FILE_SIZE` cap — the `context`/`conventions` precedent),
  parses `package.json` `scripts` (and known setup files if present), and derives the command list in code.
  This adds **no facade method / pipeline step / table** (NG2 respected) and makes **zero model calls** (AC-1
  intent). See Risk 1 for the AC-1-literal nuance.
- **Endpoints** (workspace-scoped): `GET /repos/:id/tour` → `OnboardingTour`; `POST /repos/:id/tour/regenerate`
  → `OnboardingTour` (tight per-route rate limit like intent recalculate: `{ max: 10, timeWindow: '1 minute' }`).
  - **Route justification (resolves cross-review Blocking #1):** the cross-reviewer (no repo access) read
    SPEC-02's "Server endpoints (repo resolved from workspace context, workspace-scoped)" as forbidding a
    `:id` param. The real SPEC-01 precedent is `GET /repos/:id/context` (`context/routes.ts:25`): the server
    takes `:id` (repoId) and scopes by `workspaceId` from `getContext`; the **client** supplies the repoId
    from the active-repo/workspace context. "Repo resolved from workspace context" in the spec describes the
    **client** side (nav href `/tour`, active repo like the `/context` page), not the server URL shape. The
    spec's Contracts names **no** endpoint paths. Keeping `/repos/:id/tour` matches the established backend
    convention and satisfies AC-22 (workspace scoping via `container.repoRepo.getById(ws, id)`). No spec edit
    needed; T8 client calls `/repos/:id/tour` with the active repoId (exactly like `useContextFiles`).
- **Client route** `/tour` (nav href, no `:repoId`) resolves the active repo via `useActiveRepo()`.

## Tasks

| # | Task | Covers | Module/Layer | Files (paths) | Required skills (in order) | Parallel group | Tests |
|---|------|--------|--------------|---------------|----------------------------|----------------|-------|
| T1 | Reconcile pre-scaffolded `Onboarding*` contracts → `OnboardingTour` + `TourSection` per field tables; mirror to client; update contract-test fixtures | AC-6, AC-8, AC-12, AC-14, AC-25 | shared / Domain | `server/src/vendor/shared/contracts/knowledge.ts`, `client/src/vendor/shared/contracts/knowledge.ts`, `server/test/contracts.test.ts`, `client/src/test/contracts.test.tsx` (or the client contract fixture file) | `zod` → `typescript-expert` | A | verified by T10/T11/T12 fixtures |
| T2 | Extend `onboarding` table (nullable `sha`,`model`,`cost_usd`,`tokens_in`,`tokens_out`); `db:generate` migration; review SQL | AC-23, AC-24, AC-25 | server / Infrastructure | `server/src/db/schema/context.ts`, `server/src/db/migrations/<generated>.sql` | `postgresql-table-design` → `drizzle-orm-patterns` | A | T11 |
| T3 | Reconcile `onboarding.system.md`: drop `routes_and_apis` from `{{sections}}` + its formatting bullets; fold route/endpoint facts into `architecture`; instruct that critical-path/reading-path entries are emitted as **structured items** (`{path,role}` / `{path,why}`), NOT inline in body, and that the model does **not** emit run commands; keep untrusted-contract lines 11-12 + mermaid-drop rule | AC-6, AC-8, AC-20 | server / prompt asset | `server/src/prompts/onboarding.system.md` | (prompt authoring — no routing-table skill) | A | T10 |
| T4 | Pure fact-gathering (facade + clone-manifest scripts → deterministic commands) + skeleton builder + path-validation + prompt-assembly | AC-1, AC-2, AC-3, AC-4, AC-7, AC-8, AC-8a, AC-9, AC-13, AC-20 | server / Application(pure) | `server/src/modules/onboarding/facts.ts`, `.../sections.ts`, `.../prompt.ts` | `onion-architecture` → `security` → `typescript-expert` | B | T10 |
| T5 | Service (getTour/regenerate split + not_available/skeleton/model branching + code-set commands + cost log/persist) + repository (only file touching `onboarding` table) + routes + register in `modules/index.ts` | AC-4, AC-5, AC-8, AC-8a, AC-9, AC-10, AC-11, AC-12, AC-15, AC-18, AC-19, AC-22, AC-23, AC-24, AC-25 | server / Application+Infra+Presentation | `server/src/modules/onboarding/service.ts`, `.../repository.ts`, `.../routes.ts`, `.../index.ts`, `server/src/modules/index.ts` | `onion-architecture` → `fastify-best-practices` → `drizzle-orm-patterns` → `security` | C | T10, T11 |
| T7 | Nav item "Onboarding Tour" (between Pull Requests & Project Context, `gKey:"o"`, SHORTCUTS entry) + fix `activeKeyFor`: map `/tour` → `"onboarding-tour"` and **remove** the `/onboarding` → `"onboarding-tour"` line (Add Repository page) | AC-14 (nav/route), AC-15 (nav) | client / shell | `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/helpers.ts` | `frontend-architecture` | B | T13 |
| T8 | Data hooks `useTour(repoId)` (GET `/repos/:id/tour`) + `useRegenerateTour` (POST, updates cache) + barrel export | AC-15 | client / lib | `client/src/lib/hooks/onboarding.ts`, `client/src/lib/hooks/index.ts` | `frontend-architecture` → `react-best-practices` | C | T12 |
| T9 | `/tour` page + `TourView` (header w/ repo+files-indexed+last-refreshed+Regenerate, "On this page" TOC, 5 section cards; **markdown `a` renderer overridden to plaintext**; reuse `MermaidDiagram`; copyable ordered commands; numbered reading list w/ why; **Open** chips from validated `links[]` → in-app file viewer (`useRepoFile`+`CodeViewer`); skeleton badge; not_available sync CTA; loading state) | AC-4, AC-7, AC-10, AC-12, AC-14, AC-15, AC-16, AC-17, AC-21 | client / app | `client/src/app/tour/page.tsx`, `client/src/app/tour/_components/TourView/**` | `frontend-architecture` → `react-best-practices` → `next-best-practices` → `security` | D | T12, T13 |
| T10 | Server unit tests | AC-2, AC-3, AC-6, AC-7, AC-8, AC-13, AC-19, AC-20 | server / test | `server/src/modules/onboarding/*.test.ts` | `backend-testing` | E | — |
| T11 | Server integration tests (testcontainers) | AC-1, AC-4, AC-5, AC-8, AC-8a, AC-9, AC-11, AC-12, AC-18, AC-22, AC-23, AC-24, AC-25 | server / test | `server/src/modules/onboarding/onboarding.it.test.ts` | `backend-testing` | E | — |
| T12 | Client RTL unit tests | AC-7, AC-16, AC-17, AC-21 | client / test | `client/src/app/tour/_components/TourView/TourView.test.tsx` (+ any sub-component tests) | `react-testing-library` | E | — |
| T13 | e2e flow `05-onboarding-tour` (LLM stubbed per hermetic harness) | AC-10, AC-14, AC-15 | e2e | `e2e/…/05-onboarding-tour.*` (follow e2e module conventions) | (e2e module conventions — no routing-table skill) | E | — |

Notes for executors:
- **T4 — final helper layout (3 files, consolidated per "simplest thing that works"):**
  - `facts.ts` → `gatherFacts(container, ws, repoId) → TourFacts`. Calls `getIndexState`; if usable/degraded:
    `getTopFilesByRank(repoId, N)` (reading-path order — AC-2/AC-3; pure PageRank, no hotness), `getCriticalPaths`
    (AC-4), `getReachableFacts(topFiles, 2)` (route/endpoint facts folded into architecture — NG6/AC-6),
    `getRepoMap` (fixed token budget — AC-13). Also reads the clone **manifest** (`package.json` scripts) via
    `resolveInClone`+`MAX_FILE_SIZE` and derives `commands: string[]` in code (AC-8). No generator-side size
    threshold anywhere (AC-13/NG2). Exposes `allowedPaths` (the union of every real path in the facts) for validation.
  - `sections.ts` → the five section id/order/title **constants**; `buildSkeleton(facts, reason) → TourSection[]`
    (AC-9, facts-only; reading list = path + rank position, no model "why" — confirmed asymmetry); and
    `validatePaths(items, allowedPaths)` dropping any item whose `path ∉ allowedPaths` (AC-7).
  - `prompt.ts` → `buildUserMessage(facts)` wrapping every untrusted block with reviewer-core's exported
    `wrapUntrusted`/`INJECTION_GUARD` (AC-20), plus the **model output Zod schema** (structured items above).
- **T5 — mirror the intent split** (`IntentService.getIntent`/`recalculate`/`generateAndStore`,
  `server/src/modules/intent/service.ts:46-148`): private `generateAndStore(ws, repo, facts)` does
  resolveFeatureModel('onboarding') → `container.llm(provider)` → `loadPromptTemplate('onboarding.system.md')`
  + render `{{sections}}`/`{{language}}` → **one** `completeStructured` (model schema from `prompt.ts`) → map
  `items[]` → transport `links[]` and `validatePaths` against `facts.allowedPaths` (AC-7) → **overwrite**
  `run_locally.commands` with `facts.commands` (AC-8, regardless of any model output) → structured-log cost USD
  (`req.log.info({ cost_usd, tokens_in, tokens_out, model })`, AC-18; null-safe, AC-19) → upsert row (json + sha
  + model + cost_usd + tokens). `getTour` checks the cached row's `sha` vs current `getIndexState.lastIndexedSha`:
  hit → return without a model call (AC-23); miss → gatherFacts → branch. `regenerate` re-gathers + calls
  `generateAndStore` directly, bypassing the cache (AC-15/AC-24). Branch order per the spec flowchart:
  `repo.clonePath == null` → `not_available` reason `not_cloned` (AC-12, mirror `context/service.ts:46-49`);
  index degraded/failed or `repo_too_large` → skeleton, no model call (AC-9); completeStructured throw → skeleton
  reason `model_failed` (AC-11). All repo lookups via `container.repoRepo.getById(ws, id)` (AC-22).
- **T9 — AC-4/AC-7/AC-21 concretely:**
  - Render `body` with `react-markdown` (no `rehype-raw`) **and override the `a` component** to render its
    children as a plain `<span>` — markdown-authored links never become an `href` (AC-21, resolves Blocking #2).
  - The ONLY clickables are (a) **Open** chips built from the validated `TourSection.links[]` and (b) copyable
    `commands`. An Open chip opens the file via the existing in-app viewer — `useRepoFile(repoId, path)` +
    `CodeViewer` overlay, exactly like BlastPanel (AC-4: guaranteed real indexed path because the endpoint
    404s otherwise; and only validated paths are ever rendered). `githubBlobUrl` is the documented fallback if
    an in-app overlay is deemed heavier than needed — implementer picks, both use only validated paths.
  - `diagram` via `client/src/components/mermaid-diagram/` `MermaidDiagram` (already validates with
    `mermaid.parse({suppressErrors})` and drops invalid — script-safe + "invalid mermaid dropped").
  - `@testing-library/user-event` is NOT installed — T12 uses `fireEvent` (client INSIGHTS).

## Implementation sequence

1. **Group A (parallel):** dispatch T1, T2, T3 as three concurrent implementers (disjoint files). Converge:
   contracts + migration + prompt are ready.
2. **Group B (parallel, after A):** dispatch T4 (needs T1 types) and T7 (client shell, independent).
3. **Group C (parallel, after B):** dispatch T5 (needs T1+T2+T3+T4) and T8 (needs T1). Server vs client files.
4. **Group D (after C):** dispatch T9 (needs T1+T7+T8).
5. **Group E — tests (parallel, after their targets):** T10 & T11 after T5; T12 after T9; T13 after T9+T5.
   Disjoint files, run concurrently. Each ends with its module green (typecheck +
   `./node_modules/.bin/vitest run <files>`; `.it.test.ts` needs Docker).

## Recommendations (for the user to approve)

1. **Keep narrative generation server-side; do NOT add a `generateOnboarding` to reviewer-core.** *Rationale:*
   the onboarding system prompt is a **server file** (`src/prompts/onboarding.system.md`) loaded via fs; reviewer-core
   is pure (no fs). Server-side prompt-assembly (`onboarding/prompt.ts`, mirroring `conventions/prompt.ts`) +
   `container.llm().completeStructured` is the simplest thing that keeps reviewer-core pure and the helpers
   unit-testable (T10). *Cost/benefit:* fewer moving parts, no server-prompt coupling in a pure module.
2. **Extend the pre-scaffolded stubs, do not duplicate** (contract + table + prompt + feature-model + nav key
   all pre-exist). Baked into T1/T2/T3. *Rationale/benefit:* avoids a dead parallel contract + a second table.
3. **Consolidated helper layout (3 files, not 5).** Cross-review non-blocking #1: `facts.ts` + `sections.ts`
   (skeleton + validate + section constants) + `prompt.ts` (user message + model schema). *Benefit:* fewer files,
   the single-call + fallback flow stays legible; still each helper is a pure unit under test.

## Known gotchas (from INSIGHTS)

- **nav.ts is under `vendor/ui/` (Do-Not-Touch), but appending a nav item there is the sanctioned pattern —
  USER-AUTHORIZED for this task (append-only: one NAV item + one SHORTCUTS entry, no refactoring).** `context`
  and `conventions` items already live in `nav.ts:26,33`; client INSIGHTS documents adding a repo-scoped page's
  nav entry there. T7 appends only; it does not restructure the file.
- **Nullable-column safety:** a `.notNull()` column without a DB default breaks `pnpm typecheck` for every
  pre-existing insert of that table (server INSIGHTS, `pr_intent.head_sha`). T2 adds **nullable** columns only → safe.
- **`drizzle-kit generate` goes interactive only when a table gains AND drops columns in one change** (server
  INSIGHTS). T2 only **adds** columns → non-interactive. Still review the SQL before `db:migrate`.
- **Integration test LLM mock:** register `MockLLMProvider` under the key `resolveFeatureModel` returns for
  `'onboarding'` = **`openrouter`**: `overrides: { llm: { openrouter: mock } }` (server INSIGHTS). Assert
  `mock.calls.length === 0` for cache-hit/skeleton/not_available (AC-9/AC-12/AC-23), `=== 1` for a fresh
  generation (AC-5). Read untrusted-wrapping via `.calls[…].req.messages[1].content` (AC-20). For AC-8, feed the
  mock a fixture whose `run_locally` differs from the manifest and assert the response uses the fact-derived commands.
- **`completeStructured({ schema })` forces tool-use → root schema MUST be an object** (server INSIGHTS): the
  model schema in `prompt.ts` is `z.object({ architecture, critical_paths, reading_path, first_tasks, run_locally })`.
  It auto-retries then throws `ExternalServiceError` after `maxRetries` — T5's try/catch converts that into the AC-11 skeleton.
- **`cost_usd` is USD, use `doublePrecision`** (never integer/cents); OpenRouter `usage.cost` else `estimateCost`
  (server INSIGHTS; `run-executor.ts`).
- **Shared contracts live in BOTH server and client `vendor/shared/`** and can diverge — apply the SAME targeted
  edit to the client copy, don't overwrite (client INSIGHTS). All mocks/fixtures carrying the contract include the
  new fields (even `null`).
- **Client tests use `fireEvent`, not `userEvent`** (not installed); stub `Element.prototype.scrollIntoView` if
  the TOC anchors scroll (client INSIGHTS).
- **Vendored `<Markdown>` styles only `p/strong/code/a`;** headings/lists render flat unless `.dd-md …` is styled
  in `globals.css` (client INSIGHTS). Overriding the `a` renderer per AC-21 requires `react-markdown` directly with
  a `components` map — the vendored primitive may not expose that; the implementer chooses `react-markdown` for the
  body render so the `a`-override is available (and styles the `.dd-md`-equivalent in the page's own styles.ts / globals).
- **In-app file viewer contract:** `GET /repos/:id/file?path=` → `RepoFileContent` already exists and is
  path-traversal-guarded server-side; the Open chip reuses it via `useRepoFile` — no new endpoint.
- **Run tests via the local binary** `./node_modules/.bin/vitest run <files>` / `./node_modules/.bin/tsc --noEmit`
  — `pnpm test`/`pnpm exec vitest` fail in this WSL+Windows-pnpm setup (server INSIGHTS). *(Executor-run only.)*

## Risks / open questions

1. **AC-1 literal vs. scripts source (surfaced by cross-review AC-1 spot-check).** AC-1 says facts come "**only**
   from the `repoIntel` facade (getTopFilesByRank, getCriticalPaths, getReachableFacts, getRepoMap, getIndexState)."
   Verified: **no facade method exposes scripts/setup** — `getRepoMap` returns a symbol-signature skeleton only
   (`repo-intel/pipeline/repo-map.ts`). AC-8 nonetheless requires commands "derived from real scripts/setup facts."
   Resolution taken (per coordinator directive #4): read the clone **manifest** (`package.json` scripts) directly
   in `facts.ts` via the existing `resolveInClone` guard — the `context`/`conventions` precedent. This adds **no
   facade method / pipeline / table** (NG2 respected) and makes **zero model calls** (AC-1's core intent). The only
   deviation from AC-1's literal method list is the scripts source, which that list simply omits. **Flagging** in
   case the spec author intends scripts to instead be inferred by the model from `getRepoMap` (weaker for AC-8) —
   the plan chooses the deterministic, AC-8-safe reading.
2. **Cache stampede — consciously OMITTED (accepted).** Two simultaneous cold-cache loads on the same SHA could
   fire two model calls (cross-review non-blocking #2). DevDigest is a single-user, local-first tool and the spec
   does not require single-flight; the extra guard is not worth the complexity. Accepted as-is; noted for later if
   the tool becomes multi-user.
3. **e2e mode (T13).** The e2e runs against the seeded `acme/payments-api` (real `clonePath`). Per coordinator
   directive Q6, the LLM is **stubbed in the e2e server** following the existing hermetic harness convention (T13
   mirrors whatever the current `0x` flows do). If the harness stubs a fixed structured tour, AC-5/AC-15 assert on
   `model` mode; otherwise T13 asserts `skeleton` mode (AC-10) — implementer follows the harness.
4. **`activeKeyFor` `/onboarding` line removal (T7).** USER-APPROVED to fix now: `/onboarding` (Add Repository
   screen) no longer maps to `onboarding-tour`; `/tour` does. Low-risk one-line change; the Add Repository page
   (`client/src/app/onboarding/`) source is otherwise untouched.

## Definition of Done

- Every AC-1…AC-25 (+ AC-8a) is covered by ≥1 task (see matrix) and provable by its `Verify:` tag.
- The five sections render in fixed order with stable ids and no `routes_and_apis` (AC-6); every clickable path
  comes from a validated structured item (AC-7); markdown-authored links are neutralized and the narrative renders
  script-safe (AC-21); Open chips open real indexed files via the in-app viewer (AC-4).
- Run commands are code-derived from the manifest, never model-authored, copy-only (AC-8).
- Cache-by-SHA works: cache hit → 0 model calls; SHA change / Regenerate → regenerate (AC-23/AC-24/AC-15).
- Degraded → skeleton + badge; not-cloned → `not_available` + CTA; model failure → skeleton; never a 500
  (AC-9/AC-10/AC-11/AC-12).
- Cost/tokens/model logged in USD (AC-18/AC-19) **and** persisted + exposed on `generated` (AC-25).
- Server typecheck + `*.test.ts`/`*.it.test.ts` pass; client typecheck + RTL tests pass; e2e `05-onboarding-tour` passes.
- Non-goals respected (NG1–NG6). Do-Not-Touch untouched except the USER-AUTHORIZED `nav.ts` append —
  `client/src/vendor/ui/*` otherwise unchanged, `server/src/vendor/shared/` extended only via the mirrored contract
  edit, no pre-scaffolded table deleted, no `.env` touched. `client/src/app/onboarding/` (Add Repository) source untouched.
