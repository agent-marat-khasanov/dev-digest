# Implementation Plan: eval-pipeline

**Spec:** `specs/eval-pipeline.md` | **Spec ID:** SPEC-04 | **Status at planning time:** approved
**Execution mode:** multi-agent

## Context

L06 turns the skill-scoped eval flow into an **agent-scoped regression net for the product**: mint eval
cases from real accept/dismiss decisions, run an agent's case set with the agent's *own* config, score
recall / precision / citation-accuracy purely in code, and prove a system-prompt change moves the
numbers. The scope here is **Core + Stretch 2 (Case Editor) + Stretch 3 (trend charts)** — every AC-1..AC-44.
Stretch 1 / 4 / 5 are explicitly out.

**Extend, do not rebuild.** Almost the entire backend already exists but is skill-scoped. Confirmed by reading:

- Pure scorer `scoreEval` (`server/src/modules/evals/score.ts:30`) — reused **unchanged** (AC-14..AC-19).
- Real-LLM run loop `EvalsService.runOne` (`server/src/modules/evals/service.ts:82`) — but it **hardcodes**
  `GENERAL_REVIEWER_PROMPT` + `deepseek/deepseek-v4-flash` (`service.ts:27`,`:28`,`:92-100`). The agent path
  must instead resolve the agent's own `systemPrompt`/`provider`/`model`/`strategy` + enabled skill bodies —
  mirroring `ReviewRunExecutor.runOneAgent` (`server/src/modules/reviews/run-executor.ts:144-244`), **minus**
  the PR/repo-intel enrichment (an eval case is a stored diff, not a live PR — no callers/repoMap/intent/specs).
- `reviewer-core` (`reviewPullRequest`, `groundFindings`) — reused as a pure function; **no edits** (Non-goal).
- Existing Zod contracts + `eval_cases`/`eval_runs` schema — extended, not re-created. `eval_cases.ownerKind`
  already has `'agent'` (`server/src/db/schema/eval.ts:12`); `findingContext` already resolves
  finding→review→agentId→workspace (`server/src/modules/reviews/repository/review.repo.ts:103-117`); a
  finding's single-file diff is `pr_files.patch` for the finding's file (`server/src/db/schema/pulls.ts:36-45`,
  `getPrFiles` at `server/src/modules/reviews/repository.ts:38`); `parseUnifiedDiff` is a pure importable
  parser (`server/INSIGHTS.md:32`).
- `EvalsService`/`EvalsRepository` are `new`-ed per request with `app.container` inside the route module
  (`server/src/modules/evals/routes.ts:25`) — **no container.ts wiring change is needed**; the evals module
  is already registered (`server/src/modules/index.ts:10`,`:43`).

## Acceptance criteria (from the spec)
| AC | Criterion (intent) | Covered by task(s) |
|----|--------------------|--------------------|
| AC-1 | Mint from **accepted** finding → agent-owned case, owner via finding→review→agentId, non-empty `expected_output` (one `ExpectedFinding`) | T2, T3, T7 |
| AC-2 | Mint from **dismissed** finding → agent-owned case, **empty** `expected_output` (decoy) | T2, T3, T7 |
| AC-3 | must-find/must-not-flag expressed **only** as `expected_output` cardinality (no type column) | T2, T5 |
| AC-4 | Minted case `input_diff` = the finding's **single-file** diff | T2 |
| AC-5 | Re-mint from same finding → no duplicate, surface existing case | T2 |
| AC-6 | Evals tab returns every agent-owned case as `EvalCaseSummary[]` with latest-run summary (or null) | T2, T3 |
| AC-7 | `POST /agents/:id/eval-runs` runs every case, one `eval_runs` row per case | T2, T3 |
| AC-8 | Runs use the agent's **own** `system_prompt`/`provider`/`model`/`strategy` + enabled skill bodies | T2 |
| AC-9 | Each case runs against its **stored** `input_diff` unchanged | T2 |
| AC-10 | `POST /agents/:id/evals/:caseId/run` runs one case, returns updated `EvalCaseSummary` | T2, T3 |
| AC-11 | Run-all in progress → running indicator + second concurrent run-all disabled | T8 |
| AC-12 | Zero cases → no-op empty result with empty-state message, not an error | T2 |
| AC-13 | One case's LLM failure in run-all → record failed (`pass=false`, metrics null), continue | T2 |
| AC-14 | Metrics computed with **zero LLM calls** (reuse `scoreEval` + grounding inside `reviewPullRequest`) | T5, T2 |
| AC-15 | `recall` = matched-expected ÷ total-expected (1 when none expected) | T5 |
| AC-16 | `precision` = matched-expected ÷ total-actual (1 when clean+none, 0 when clean+any) | T5 |
| AC-17 | `citation_accuracy` = grounded-survivors ÷ total-actual | T5 |
| AC-18 | Seed **Security Reviewer** with ≥8 agent-scoped cases (must-find + tempting-but-clean decoys) | T4 |
| AC-19 | Both expectation types score correctly | T5 |
| AC-20 | `verify:l06` in `server/package.json` — deterministic model-free Vitest over `scoreEval`, asserts AC-14/15/16/17/19 | T5 |
| AC-21 | Agent editor "Evals" tab listing cases + run history, mirroring the Skill Evals tab | T6, T8 |
| AC-22 | Case row shows status, expected-vs-got counts, severity·category badge (or "empty []") | T8 |
| AC-23 | Sidebar "Eval Dashboard" entry under SKILLS LAB → `/eval*` | T6 |
| AC-24 | Eval Dashboard returns NEW `EvalDashboardOverview` (per-agent rows + recent runs) | T1, T2, T3, T9 |
| AC-25 | No runs yet → dashboard empty state (not error/blank) | T9 |
| AC-26 | Per-agent dashboard returns `EvalDashboard` aggregate | T2, T3, T8 |
| AC-27 | Compare two runs → per-metric delta (recall, precision, citation-accuracy, cost) | T2, T3, T10 |
| AC-28 | Compare shows system-prompt diff between the two agent versions (resolve via `eval_runs.agent_version`) | T1, T2, T3, T10 |
| AC-29 | Two runs under different prompt versions → non-zero recall/precision delta (the experiment) | T10 |
| AC-30 | Compare offered only between two runs of the **same** agent | T10 |
| AC-31 | Case editor: paste diff (+ preview), choose expectation type, set file+line range; store via `EvalCaseInput` | T11, T3 |
| AC-32 | Manually authored cases run through the same `POST /agents/:id/eval-runs` | T2, T3, T11 |
| AC-33 | Invalid `expected_output` → reject save with validation error, persist nothing | T3, T2 |
| AC-34 | Evals tab charts recall/precision/citation-accuracy across all runs, tooltip = version + cost | T12 |
| AC-35 | <2 runs → single-point/placeholder, not empty/broken chart | T12 |
| AC-36 | Every eval endpoint scopes all case/run queries by `workspace_id` via request context | T2, T3 |
| AC-37 | Cross-workspace / owner-mismatch agent/case/run → `404` without leaking existence | T2, T3 |
| AC-38 | `input_diff` treated as data — reaches model only via `wrapUntrusted`/`INJECTION_GUARD`; never executed | T2 |
| AC-39 | Rendered diff/expected-output is inert text (no unsanitized `dangerouslySetInnerHTML`) | T7, T11 |
| AC-40 | "Turn into eval case" disabled (with tooltip) until finding accepted/dismissed | T7 |
| AC-41 | Run-all (agent + workspace) returns cost **estimate** and requires explicit confirm before any LLM call | T2, T3, T8, T9 |
| AC-42 | Single-case run executes directly, no estimate/confirm | T2, T3, T8 |
| AC-43 | Workspace "Run all agents" runs each set **sequentially**, gated by the same estimate+confirm | T2, T3, T9 |
| AC-44 | Each `eval_runs` row records the integer agent `version` it ran under (new nullable `eval_runs.agent_version`) | T1, T2 |

Non-goals (hard scope boundaries, **not** tasks): no `reviewer-core` change; no new scoring semantics;
no re-implementation of the existing skill-scoped flow/contracts/schema; Stretch 1/4/5 out.

## Affected modules & layers
- **`server/`** — presentation (`modules/evals/routes.ts`), application (`modules/evals/service.ts`),
  infrastructure (`modules/evals/repository.ts`, `db/schema/eval.ts`, new migration, `db/seed.ts`),
  domain contracts (`vendor/shared/contracts/eval-ci.ts`). Onion dependency rule preserved: service reaches
  the LLM only via `container.llm(provider)` and calls `reviewer-core` as a pure function.
- **`client/`** — new agent Evals tab + Eval Dashboard route + Case Editor + trend/compare; FindingCard mint
  control; hooks in `lib/hooks/`; one data-only edit to vendored `nav.ts` (AC-23, sanctioned) and to the
  mirrored `vendor/shared/contracts/eval-ci.ts` (AC-24, must stay in sync with server copy).
- **`reviewer-core/`** — **read-only reuse** (`reviewPullRequest`, `groundFindings`). No edits.

## Data model changes
New Drizzle migration (`pnpm db:generate` → review SQL → manual `pnpm db:migrate`; the server does **not**
auto-migrate). Add to `eval_runs` (`server/src/db/schema/eval.ts:22`):

- `agentVersion` — `integer('agent_version')`, **nullable** (existing rows get null). Records the agent
  `version` a run executed under (AC-44); Compare resolves each run's system prompt against the
  `agent_versions` snapshot for that version (AC-28, `server/src/db/schema/agents.ts:38`,
  `AgentsRepository.getVersion` `agents/repository.ts:188`).
- **[Recommendation R1 — needs approval]** `batchId` — `uuid('batch_id')`, **nullable**. Groups the per-case
  `eval_runs` rows produced by one run-all into a single logical "run" so Compare (AC-27/28/29/30), the
  dashboard "last-run pass count" (`EvalDashboardOverview`, AC-24) and the trend "one point per run"
  (AC-26/34) have a well-defined unit. See *Risks* — the spec sanctioned only `agent_version`; this adds one
  nullable column to the **same** migration.

`eval_cases` is **unchanged** (`ownerKind` already includes `'agent'`). Mint-dedup source pointer is stored in
the existing `inputMeta` jsonb (see T2 / Risks) — no column needed. Do **not** touch other pre-scaffolded
tables in `db/schema/` (Do-Not-Touch).

## API contracts
Contracts live in `server/src/vendor/shared/contracts/eval-ci.ts` and are mirrored in
`client/src/vendor/shared/contracts/eval-ci.ts` (**keep both in sync** — apply the *same targeted edit* to
each; do not overwrite the client copy, per `client/INSIGHTS.md:34`).

- **Extend** `EvalRunRecord` (`eval-ci.ts:75`): add `agent_version: z.number().int().nullable()`
  (+ `batch_id: z.string().nullable()` if R1 approved). (AC-44/AC-28)
- **NEW** `EvalDashboardOverview` (all-agents sidebar dashboard — `EvalDashboard` at `eval-ci.ts:110` is
  single-owner and cannot express per-agent rows). Shape per spec §Contracts: `agents[]` rows
  (`agent_id`, `agent_name`, `recall|null`, `precision|null`, `citation_accuracy|null`,
  `last_run_pass_count: {passed,total}|null`) + `recent_runs: EvalRunRecord[]`. (AC-24)
- Reused unchanged: `EvalCaseInput` (`:20`), `ExpectedFinding` (`:38`), `EvalCaseSummary` (`:53`),
  `EvalDashboard` (`:110`).

New / changed routes (all under existing `modules/evals/routes.ts`; every route validates **and** serializes
via `fastify-type-provider-zod`, and resolves workspace via `getContext(container, req)`):

| Method & path | Request | Response | AC |
|---|---|---|---|
| `POST /findings/:id/eval-case` | none | `EvalCase` | AC-1/2/4/5 |
| `GET /agents/:id/evals` | — | `EvalCaseSummary[]` | AC-6 |
| `GET /agents/:id/eval-runs/estimate` | — | `{ case_count, estimated_cost_usd }` | AC-41 |
| `POST /agents/:id/eval-runs` | `{ confirm: true }` | `EvalCaseSummary[]` | AC-7/8/12/13/41 |
| `POST /agents/:id/evals/:caseId/run` | none | `EvalCaseSummary` | AC-10/42 |
| `POST /agents/:id/evals` | `EvalCaseInput` | `EvalCase` | AC-31/32/33 (Stretch 2) |
| `PATCH /agents/:id/evals/:caseId` | `EvalCaseInput` (partial) | `EvalCase` | AC-31/33 (Stretch 2) |
| `DELETE /agents/:id/evals/:caseId` | — | `{ ok: true }` | — |
| `GET /agents/:id/eval-dashboard` | — | `EvalDashboard` | AC-26 |
| `GET /agents/:id/eval-runs` | — | `EvalRunRecord[]` | AC-27 (Compare source) |
| `GET /eval-runs/estimate` | — | `{ agent_count, case_count, estimated_cost_usd }` | AC-41/43 |
| `POST /eval-runs` | `{ confirm: true }` | `EvalDashboardOverview` | AC-43 |
| `GET /eval-dashboard` | — | `EvalDashboardOverview` | AC-24 |

## Tasks

| # | Task | Covers | Module/Layer | Files (paths) | Required skills (in order) | Parallel group | Tests |
|---|------|--------|--------------|---------------|----------------------------|----------------|-------|
| T1 | Contracts + schema + migration foundation: add `agent_version` (+ `batch_id` if R1) to `eval_runs` schema, generate+review migration; extend `EvalRunRecord`, add `EvalDashboardOverview` to **both** vendored `eval-ci.ts` copies; update contract-test fixtures | AC-24, AC-28(schema), AC-44 | server: domain/infra | `server/src/db/schema/eval.ts`, `server/src/db/migrations/*` (generated), `server/src/vendor/shared/contracts/eval-ci.ts`, `client/src/vendor/shared/contracts/eval-ci.ts`, `server/test/contracts.test.ts` | `onion-architecture` → `zod` → `drizzle-orm-patterns` → `postgresql-table-design` | A | contract fixture test (`server/test/contracts.test.ts`) |
| T2 | Backend agent-eval **repository + service**: agent-owner case/run queries; `insertRun` with `agent_version` (+`batch_id`); mint-from-finding (dedup via `inputMeta.source_finding_id`, single-file diff, accepted→[finding]/dismissed→[]); `runAllForAgent`/`runOneAgentCase` using agent's own config (mirror `runOneAgent` config resolution, no PR enrichment); continue-on-failure; cost estimate; workspace sequential run-all; per-agent + all-agents dashboard aggregates; tenancy + 404s | AC-1..AC-10, AC-12, AC-13, AC-24, AC-26, AC-27, AC-28, AC-32, AC-33, AC-36, AC-37, AC-38, AC-41, AC-42, AC-43, AC-44 | server: application + infrastructure | `server/src/modules/evals/service.ts`, `server/src/modules/evals/repository.ts` | `onion-architecture` → `drizzle-orm-patterns` → `security` → `typescript-expert` | B (after T1) | `server/src/modules/evals/*.it.test.ts` (testcontainers; `backend-testing`) |
| T3 | Backend **routes**: add the 13 routes above to the evals module; Zod validate+serialize; `getContext` workspace scoping; `{confirm:true}` gate wired to service | AC-1, AC-6, AC-7, AC-10, AC-24, AC-26, AC-27, AC-31, AC-32, AC-33, AC-36, AC-37, AC-41, AC-42, AC-43 | server: presentation | `server/src/modules/evals/routes.ts` | `onion-architecture` → `fastify-best-practices` → `zod` → `security` | B (after T2) | route tests via `app.inject()` (`backend-testing`) |
| T4 | Seed **Security Reviewer** with ≥8 agent-scoped cases (several must-find non-empty + several tempting-but-clean decoys with empty `expected_output`), idempotent by workspace+owner+name | AC-18 | server: infrastructure | `server/src/db/seed.ts` | `onion-architecture` → `drizzle-orm-patterns` | A | verified via `db:seed` run + count query |
| T5 | `verify:l06` script + deterministic model-free `scoreEval` test with fixtures asserting AC-14/15/16/17/19 | AC-3, AC-14, AC-15, AC-16, AC-17, AC-19, AC-20 | server: unit | `server/package.json` (add `verify:l06`, mirror `verify:l03` at `:12`), `server/src/modules/evals/score.test.ts` | `backend-testing` | A | the new `score.test.ts` (`pnpm verify:l06`) |
| T6 | Frontend foundation: new `lib/hooks/agent-evals.ts` (all agent-eval + dashboard + mint hooks); add "Evals" tab def (`AgentEditor/constants.ts`) + `VALID_TABS` (`agents/[id]/page.tsx`); add "Eval Dashboard" nav entry (`vendor/ui/nav.ts`, data-only) + `activeKeyFor` already maps `/eval*`; i18n keys | AC-23 | client | `client/src/lib/hooks/agent-evals.ts` (new), `client/src/app/agents/[id]/_components/AgentEditor/constants.ts`, `client/src/app/agents/[id]/page.tsx`, `client/src/vendor/ui/nav.ts`, `client/messages/en/*.json` | `frontend-architecture` → `next-best-practices` | C (after T1) | typecheck; nav render |
| T7 | FindingCard "Turn into eval case" control: disabled+tooltip until accepted/dismissed; wire action through `FindingsPanel`; consume mint hook; inert diff rendering | AC-1, AC-2, AC-39, AC-40 | client | `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx`, `.../FindingsPanel/FindingsPanel.tsx`, `client/messages/en/*.json` | `frontend-architecture` → `react-best-practices` → `react-testing-library` → `security` | C (after T6) | `FindingCard.test.tsx` (disabled-state), `FindingsPanel.test.tsx` |
| T8 | Agent Evals tab: new tab component (case list, run-all with estimate+confirm modal, single-case run, running indicator + concurrent-disable, per-agent dashboard aggregate); render branch in `AgentEditor.tsx` | AC-11, AC-21, AC-22, AC-26, AC-41, AC-42 | client | `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/**` (new), `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`, `client/messages/en/*.json` | `frontend-architecture` → `react-best-practices` → `react-testing-library` | D (after T6) | new `EvalsTab.test.tsx` |
| T9 | Eval Dashboard page (`/eval`): per-agent rows + recent runs; empty state; workspace "Run all agents" with estimate+confirm | AC-24, AC-25, AC-43 | client | `client/src/app/eval/page.tsx` (new) + `_components/**`, `client/messages/en/*.json` | `frontend-architecture` → `next-best-practices` → `react-best-practices` → `react-testing-library` | D (after T6) | new dashboard test |
| T10 | Compare view (same-agent only): select two runs → per-metric deltas + system-prompt diff between versions | AC-27, AC-28, AC-29, AC-30 | client | `.../AgentEditor/_components/EvalsTab/_components/CompareView/**` (new) + small edit to `EvalsTab.tsx` | `frontend-architecture` → `react-best-practices` → `react-testing-library` | E (after T8) | new CompareView test |
| T11 | Case Editor (Stretch 2): create/edit via pasted diff + inert diff preview (`DiffViewer`/`parsePatch`), expectation-type toggle, file+line range; stored via `EvalCaseInput`; runs same route | AC-31, AC-32, AC-39 | client | `.../AgentEditor/_components/EvalsTab/_components/CaseEditor/**` (new) + small edit to `EvalsTab.tsx`, uses `client/src/components/diff-viewer/*` | `frontend-architecture` → `react-best-practices` → `react-testing-library` → `security` | E (after T8) | new CaseEditor test |
| T12 | Trend charts (Stretch 3): chart recall/precision/citation-accuracy per run, tooltip = version + cost; <2 runs → single-point/placeholder | AC-34, AC-35 | client | `.../AgentEditor/_components/EvalsTab/_components/TrendChart/**` (new) + small edit to `EvalsTab.tsx` | `frontend-architecture` → `react-best-practices` → `react-testing-library` | E (after T8) | new TrendChart test |

Notes for executors:
- **T2 config resolution (AC-8):** resolve `agent = container.agentsRepo.getById(ws, agentId)`; call
  `reviewPullRequest({ systemPrompt: agent.systemPrompt, model: agent.model, strategy: agent.strategy,
  diff: parseUnifiedDiff(case.inputDiff ?? ''), llm: await container.llm(agent.provider), skills:
  <enabled skill bodies>, task, sessionId })`. **Do NOT** attach callers/repoMap/intent/specs — an eval case
  has no PR/repo context; that keeps the diff the only variable and reviewer-core pure. Enabled skill bodies:
  reuse `selectActiveSkillBlocks` (`server/src/modules/reviews/skill-blocks.ts`) over
  `container.agentsRepo.linkedSkills(agentId)` then `.map(b => b.body)` (respects both global + per-agent
  enabled). Record `agentVersion: agent.version` on each `eval_runs` insert (AC-44).
- **T2 mint (AC-1/2/4/5):** `ctx = reviewRepo.findingContext(findingId)`; 404 if
  `ctx.pull.workspaceId !== ws`; owner = `ctx.review.agentId` (404 if null); `input_diff` = the
  `pr_files.patch` for `ctx.finding.file` (via `getPrFiles(ctx.pull.id)`); `expected_output` =
  accepted → `[ExpectedFinding]` mapped per spec §Finding→case; dismissed → `[]`. Dedup: store
  `inputMeta = { source_finding_id }` and, before insert, look up the agent's cases for a matching
  `source_finding_id`; if found, return it instead of inserting.
- **T2 estimate (AC-41):** derive per-case `tokensIn ≈ tokenizer.count(systemPrompt + skills + input_diff)`,
  small fixed `tokensOut`, `estimated_cost_usd = Σ container.priceBook.estimate(agent.model, tokensIn,
  tokensOut)`. Heuristic — see *Risks*.

## Implementation sequence
1. **Group A dispatches simultaneously:** T1 (contracts+schema+migration), T4 (seed), T5 (verify:l06). Disjoint
   files. After T1, the implementer (or user) runs `pnpm db:generate` and reviews the SQL before any migrate.
2. **Group B (backend, after T1 merges):** T2 then T3 (T3 consumes T2's service API; different files —
   `service.ts`/`repository.ts` vs `routes.ts` — but ordered). Converge: backend green (`typecheck` + evals
   integration/route tests).
3. **Group C (after T1 merges):** T6 (frontend foundation) then T7 (FindingCard button, needs T6's mint hook).
   T7 runs parallel to Group D.
4. **Group D (after T6 merges):** T8 (agent Evals tab) and T9 (dashboard page) in parallel — disjoint routes
   (`agents/` vs `eval/`).
5. **Group E (after T8 merges):** T10 (Compare), T11 (Case Editor), T12 (Trend). All three edit the shared
   `EvalsTab.tsx` mount points, so **serialize E** (or give one implementer the trio) to avoid conflicts on
   that file; each owns its own new sub-component folder.
6. **Converge:** full-stack e2e experiment (see Verification). Everything depends on B + D/E being merged.

## Decisions (RESOLVED)

> Orchestrator-approved 2026-07-26 — treat all four as DECIDED, not open:
> - **R1 APPROVED** — add nullable `eval_runs.batch_id uuid` in the same migration (run-all grouping unit).
> - **R2 APPROVED** — mint dedup via `inputMeta.source_finding_id` jsonb (no new column).
> - **R3 APPROVED** — cost = `tokenizer.count × price-book` **estimate** (not a quote) for the confirm gate.
>   If `container.priceBook` does not exist, use a minimal per-model price table in the eval service (do not block).
> - **R4 APPROVED** — keep `GET /agents/:id/eval-runs` as the Compare data source (do not reuse `EvalDashboard.recent_runs`).

## Recommendations (approved)
- **R1 — add nullable `eval_runs.batch_id uuid` in the same migration (RECOMMENDED).** Cost: one extra nullable
  column. Benefit: gives Compare/trend/dashboard a well-defined "run" unit; without it a run-all is an
  untracked scatter of per-case rows and AC-24/26/27/34 must fall back to grouping by `(agent_version,
  ran_at-bucket)`, which is fragile when the same version is run twice. The spec sanctioned only
  `agent_version`; this is a minimal, consistent extension of that one migration. **The task table above
  assumes R1 approved.** If declined, T2/T10 fall back to the `(agent_version, ran_at)` grouping and this
  becomes a known fragility.
- **R2 — store mint source pointer in `inputMeta` jsonb (no schema change), not a new `source_finding_id`
  column.** Cost: dedup query reads jsonb / filters in JS over the agent's (small) case set. Benefit: avoids a
  second schema change; keeps the migration to the sanctioned `agent_version` (+ R1). Assumed in T2.

## Known gotchas (from INSIGHTS)
- **Nullable, no-default columns are the safe way to evolve a live table** — existing rows get `null`, no
  backfill, and pre-existing `insert()`s still compile. Adding a `.notNull()` column WITHOUT a DB default
  breaks `typecheck` for every existing insert of that table. So `agent_version`/`batch_id` MUST stay
  nullable. (`server/INSIGHTS.md:8`,`:14-20`)
- **`drizzle-kit generate` before `db:migrate`, always** — otherwise the migration is empty; the server does
  not auto-migrate. If a table gains AND drops columns in one change the CLI goes interactive — not the case
  here (pure column adds), so it should be non-interactive. (`server/INSIGHTS.md:109`,`:114`; `server/CLAUDE.md`)
- **Shared contracts live in BOTH `server/` and `client/` `vendor/shared/` and must stay in sync**; port the
  *same targeted edit* to the client copy — never overwrite it from the server file (drags in drift). All test
  mocks for a contract that gains a field must include it (even as `null`). (`client/INSIGHTS.md:29`,`:34`,`:30`;
  `server/INSIGHTS.md:164`)
- **`fastify-type-provider-zod`: a response-schema mismatch throws 500, not 422** — the response Zod schema must
  match exactly (nullable/optional included). (`server/INSIGHTS.md:108`)
- **`parseUnifiedDiff` is pure** — a service may import it directly without breaking the dependency rule; a raw
  `input_diff` string becomes a `UnifiedDiff` via one call (same parser the live path uses).
  `hunk.newLineNumbers` includes context lines too, so eval fixture expected spans only need to land anywhere
  inside the hunk. (`server/INSIGHTS.md:32`,`:112`)
- **IDOR/cross-workspace 404 tests: fixture helpers must take an explicit `workspaceId` override** — a helper
  closing over the default workspace can't reproduce the cross-tenant scenario (AC-37). (`server/INSIGHTS.md:145`)
- **Integration-testing an LLM feature: register the mock under the provider key the code resolves** — the
  agent path resolves `container.llm(agent.provider)`, so inject under that key; `MockLLMProvider.calls`
  lets you assert **zero** LLM calls for the scorer (AC-14). (`server/INSIGHTS.md:116`,`:148`)
- **Skill Evals tab precedent (`server/INSIGHTS.md:173-178`, `client/INSIGHTS.md:129-133`):** cases seeded
  idempotently by workspace+owner+name; runs start "never run"; `mutation.variables` + `isPending`
  distinguishes the acting row; this repo styles via co-located `styles.ts` inline objects, not Tailwind.
- **Client tests use `fireEvent`, not `@testing-library/user-event` (not installed)**; a component calling
  `scrollIntoView` must stub it under jsdom. (`client/INSIGHTS.md:13`,`:14`,`:62`)
- **Untrusted markdown/diff must render inert** — model output links neutralized; no `rehype-raw`; render raw
  diff as plain text. (`client/INSIGHTS.md:72-75`; AC-38/AC-39)
- **Path-alias guard is a vitest test** (`client/src/test/architecture.test.ts`) — reach shared infra via
  `@/lib`/`@/components`/`@messages`, never `../`; intra-feature co-location imports stay relative.
  (`client/INSIGHTS.md:11`,`:31`)
- **`reviewer-core` is type-checked transitively by the server** via the path alias — in a fresh worktree
  `pnpm install` in `reviewer-core/` too or server typecheck fails with misleading "Cannot find module"
  errors. (`server/INSIGHTS.md:103-105`)
- **Adding a new untrusted prompt section is NOT needed** — the eval path passes `input_diff` through
  `reviewPullRequest`'s existing diff channel, already wrapped by the engine; no `reviewer-core` edit.
  (`reviewer-core/INSIGHTS.md:20-21`, `reviewer-core/CLAUDE.md`)

## Cross-cutting constraints (restated for every task)
- **Workspace tenancy on every query + IDOR-proof 404s (AC-36/37):** eval endpoints resolve the workspace via
  `getContext(container, req)`; `eval_runs` has no `workspace_id` so scope via `case_id → eval_cases.workspace_id`
  (join/filter); mismatched agent↔case owner or cross-workspace agent/case/run → `NotFoundError` (404), never
  leak existence.
- **Zod validate + serialize on every route** (`fastify-type-provider-zod`); response schema must match exactly.
- **Manual migrations** — `pnpm db:generate` then review SQL then `pnpm db:migrate`; server never auto-migrates.
- **`reviewer-core` stays pure** — reused as a function; no DB/HTTP/fs added.
- **Two vendored `eval-ci.ts` copies stay in sync** — same edit to each, no overwrite.
- **Untrusted diff as data + inert rendering (AC-38/39)** — diff reaches the model only through the engine's
  `wrapUntrusted`/`INJECTION_GUARD`; the eval layer never executes/evals/shell-interpolates it; the UI renders
  it as inert text.
- **Do-Not-Touch:** the `nav.ts` (AC-23) and client `eval-ci.ts` (AC-24) edits are *sanctioned data-only*
  additions, not refactors; no other `vendor/` edits; no deletion of pre-scaffolded tables; no `.env` edits.
- **Coding rules:** simplest thing first; no impossible-scenario error handling; no scope creep; explicit types.

## Verification
- **`cd server && pnpm verify:l06`** green — the deterministic, model-free `scoreEval` test (AC-14/15/16/17/19),
  exits non-zero on any regression (AC-20). (In this WSL setup run the local binary directly if `pnpm`
  wrappers fail: `./node_modules/.bin/vitest run src/modules/evals/score.test.ts` — `server/INSIGHTS.md:115`.)
- **Per module:** `server` `pnpm typecheck` + `pnpm test` (evals integration `*.it.test.ts` via testcontainers;
  route tests via `app.inject()`); `client` `pnpm typecheck` + `pnpm test`.
- **Migration applied:** `pnpm db:generate` → review generated SQL → `pnpm db:migrate`; then `pnpm db:seed`
  (Security Reviewer gains ≥8 agent cases — AC-18).
- **End-to-end experiment (the homework video):** open a PR, accept a real finding → FindingCard "Turn into
  eval case" enables → mint (must-find). Open the agent's **Evals** tab → **Run all** → confirm the cost
  estimate → read recall/precision/citation-accuracy. Edit the agent's system prompt (bumps `version`) →
  Run all again → **Compare** the two runs: per-metric deltas + the system-prompt diff between the two
  versions, with a **non-zero** recall/precision delta (AC-29). Open **Eval Dashboard** (sidebar) → per-agent
  rows + recent runs; **Run all agents** → confirm estimate → sequential run. Verify DB via a throwaway `tsx`
  script using `createDb(process.env.DATABASE_URL)` inside `server/` (psql-through-harness is unreliable —
  `server/INSIGHTS.md:113`).

## Risks / open questions
1. **Compare/trend "run" granularity (drives R1).** `eval_runs` rows are **per-case**; a run-all has no batch
   id. AC-24 (`last_run_pass_count {passed,total}`), AC-26/34 ("one point per run"), AC-27 ("select two runs")
   all imply a run-all **batch** unit. Recommend R1 (`batch_id`). If declined, the fallback grouping by
   `(agent_version, ran_at-bucket)` is fragile across repeated runs of the same version — **needs a human
   decision before T2/T10**.
2. **Cost-estimate heuristic (AC-41).** The spec says "derived from case count × the agent's own
   provider/model" but not the exact formula. Plan uses `tokenizer.count(prompt+diff)` + `priceBook.estimate`.
   It is an estimate, not a quote; confirm this is acceptable for the confirm-gate UX.
3. **Mint dedup key (AC-5).** No `source_finding_id` column exists; plan uses `inputMeta` jsonb (R2). If a
   stronger guarantee (DB unique constraint) is wanted, that needs a column + migration — confirm R2 is enough.
4. **Estimate for workspace run-all (AC-43) must sum per-agent estimates** where each agent uses its **own**
   model — confirmed derivable from `agentsRepo.list` + per-agent case counts; no blocker, just noted.
5. **`GET /agents/:id/eval-runs`** (Compare data source) is not in the spec's route table but is required by
   AC-27's "select two runs" UI; added as an obvious read endpoint. Flag if the spec author intended Compare
   to reuse `EvalDashboard.recent_runs` instead.

## Definition of Done
- Every AC-1..AC-44 covered and provable (traceability table above; each AC maps to ≥1 task).
- `pnpm verify:l06` green; `server` + `client` `pnpm typecheck` + `pnpm test` pass.
- New migration generated, reviewed, and applied manually; seed yields ≥8 Security Reviewer agent cases.
- Non-goals respected (no `reviewer-core` change; no new scoring semantics; no re-implementation of the
  skill-scoped flow; Stretch 1/4/5 untouched).
- Do-Not-Touch honored (only the sanctioned `nav.ts` + client `eval-ci.ts` data edits; no pre-scaffolded
  table deletions; no `.env` edits); tenancy + IDOR-proof 404s enforced on every eval endpoint.
</content>
</invoke>
