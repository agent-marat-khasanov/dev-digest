# Spec: PR Why + Risk Brief  |  Spec ID: SPEC-03  |  Status: approved

## Problem & why

A reviewer opening a pull request has to reconstruct, by hand, four things before they can review well:
*what* the PR does, *why*, *how risky* it is, and *where to look first*. DevDigest has already computed
every raw ingredient for those answers in earlier lessons — the PR's cached **intent**
(`pr_intent` row, `server/src/modules/intent/service.ts:46-62`), the deterministic **blast-radius**
summary with real symbols/callers/endpoints (`server/src/modules/blast/service.ts:24-94` over
`container.repoIntel.getBlastRadius`), the **smart-diff groups & stats** by role
(`server/src/modules/smart-diff/service.ts:19-85`), the **linked issue**
(`intent/service.ts:96-110` via `github.getIssue`), and **project-context specs** attached to a
reviewer agent (`server/src/modules/reviews/run-executor.ts:386-444`, the `buildSpecBlocks` clone-read).

**PR Why + Risk Brief** composes those already-built artifacts into a single prompt and makes **exactly
one structured LLM call** to produce a `Brief { what, why, risk_level, risks[], review_focus[] }`. Its
core principle — like SPEC-02 — is **"code gathers the facts, the model writes the brief"**: no diff
hunks or file contents are ever placed in the prompt, only the higher-level artifacts. Every risk and
review-focus entry the model emits must reference a **real file or endpoint drawn from the blast map /
changed-file set**, never an invented path. The result is cached **per PR** (`pr_brief` table,
`server/src/db/schema/reviews.ts:60-65`) and rendered as a **PrBriefCard** on the PR page: risk level in
color, concrete risks with links to real files, and a review-focus list of what to read first. A
**Regenerate** button forces a fresh call; re-opening the PR page serves the cached brief with **no new
model call**. The `'risk_brief'` feature-model (`platform.ts:58-64`, default `openai`/`gpt-4.1`) and the
`pr_brief` table are already pre-scaffolded.

## Goals / Non-goals

### Goals
- **G1 — Artifact-only input assembly.** Build the model input ENTIRELY from already-built artifacts
  (intent, blast summary, smart-diff groups/stats, linked issue, attached specs) — **never** diff hunks
  or file contents — with zero extra model calls to gather them.
- **G2 — One structured brief call.** Turn those artifacts into `Brief { what, why, risk_level, risks[],
  review_focus[] }` with exactly one `completeStructured` call, model resolved via
  `resolveFeatureModel(container, ws, 'risk_brief')`.
- **G3 — Grounded references.** Every `risks[].file_refs` and every `review_focus[].path` resolves to a
  real file/endpoint present in the gathered artifacts; hallucinated references are dropped, not linked.
- **G4 — Per-PR cache + Regenerate.** Cache the brief per PR; re-opening the page serves the cache with
  no model call; Regenerate forces a fresh call and replaces the cache.
- **G5 — PrBriefCard.** A client card on the PR page: risk level with color, `what`/`why` narrative,
  concrete risks with severity, and a review-focus list linking to the referenced files.
- **G6 — Untrusted-input safety.** Repo/third-party text (intent, issue, spec bodies, blast-derived
  strings) enters the prompt as wrapped data; model output reaches the UI non-executably.
- **G7 — Cost visibility.** Record and persist the generation cost (USD), tokens, and model with the
  cached brief and expose them on the response, so cost is queryable per generation (SPEC-02 parity).

### Non-goals (explicit)
- **NG1 — WhyTimeline (stretch).** A history of briefs across a PR's commits is **out of scope** this
  lesson. The `pr_brief` cache stores one current brief per PR, not a per-commit series.
- **NG2 — No diff/file content in the prompt.** Diff hunks, file bodies, and per-line patches are never
  included in the model input (this is a hard input constraint, not just an optimization).
- **NG3 — No new indexing or diff parsing.** The brief is a read-only consumer of existing artifacts; it
  adds no repo-intel pipeline steps, no new facade methods, and does not re-parse the diff.
- **NG4 — No editing the brief in the app**, and **no auto-posting** the brief to GitHub.
- **NG5 — No new "risks engine".** Risks come from the single brief call over the artifacts, not from a
  separate analysis pass; the pre-existing `Risk`/`Risks` contract shapes are reused (`brief.ts:46-62`).

## User stories
- **US1** — As a reviewer, I open a PR and read a card telling me what it does and why, so I don't have
  to reconstruct intent from the diff.
- **US2** — As a reviewer, I see a color-coded risk level and a list of concrete risks that each link to
  the real file/endpoint at stake, so I can jump straight to the dangerous parts.
- **US3** — As a reviewer, I follow the review-focus list top-to-bottom to know what to read first.
- **US4** — As a reviewer, I click Regenerate after new commits and get a fresh brief; on a plain
  re-open of the page I get the cached brief instantly with no model call.
- **US5** — As the course author, I confirm the model input never contains diff hunks/file bodies and
  stays within the fixed input budget, so the brief is cheap and grounded.

## Acceptance criteria (EARS)

### Input assembly (G1)
- **AC-1** — WHEN a brief is generated, the system SHALL assemble the model input ENTIRELY from
  already-built artifacts: (a) the cached PR intent, (b) the blast-radius summary with changed
  symbols / downstream callers / affected endpoints & crons, (c) the smart-diff groups and stats by
  role, (d) the linked issue title+body, and (e) attached project-context specs — and SHALL include
  **no** diff hunks, patches, or file contents in the prompt (NG2). *Verify: integration*
- **AC-2** — The system SHALL gather those artifacts through the existing read paths with **zero**
  additional model calls: cached intent via `IntentRepository.getByPr`
  (`intent/service.ts:50`), blast via `container.repoIntel.getBlastRadius`
  (`blast/service.ts:34`), smart-diff via the DB-only `SmartDiffService`
  (`smart-diff/service.ts:19-85`), the linked issue via `github.getIssue`
  (`intent/service.ts:100-105`), and specs via the `buildSpecBlocks` clone-read
  (`run-executor.ts:386-444`). *Verify: integration*
- **AC-2a** — The attached-specs input SHALL be the **union of context-attached specs across ALL
  workspace agents** that have context attachments, **deduplicated by path**, ordered deterministically,
  and capped by the AC-3 budget (specs are the first artifact dropped, AC-3a). *Verify: integration*
- **AC-3** — The assembled model input SHALL be bounded to **≤ 8000 tokens**, measured with the existing
  `container.tokenizer` (`TiktokenTokenizer`, `platform/container.ts:147-150`; `.count(content)` as used
  by `context/service.ts:63` and `run-executor.ts:433`). *Verify: unit*
- **AC-3a** — WHEN the assembled input exceeds the AC-3 budget, the system SHALL truncate deterministically
  in this fixed source-priority drop order: **attached specs first → linked issue → smart-diff detail →
  blast detail**; the **intent digest and the blast-radius summary SHALL NEVER be truncated** (they are
  the grounding spine), so the same input always truncates the same way. *Verify: unit*

### Generation (G2)
- **AC-4** — WHEN the input is assembled, the system SHALL produce `Brief { what, why, risk_level,
  risks[], review_focus[] }` with **exactly one** `completeStructured` call, resolving provider+model
  via `resolveFeatureModel(container, workspaceId, 'risk_brief')` (`platform.ts:58-64`, default
  `openai`/`gpt-4.1`). *Verify: integration*
- **AC-5** — The `risk_level` SHALL be one of `high | medium | low` (reusing the existing
  `RiskSeverity` enum, `brief.ts:47`); each `risks[]` entry SHALL carry `kind`, `title`,
  `explanation`, `severity`, and `file_refs` (the existing `Risk` shape, `brief.ts:50-57`).
  *Verify: unit*

### Grounded references (G3)
- **AC-6** — Every `risks[].file_refs` entry and every `review_focus[].path` SHALL be validated against
  the known real-reference set assembled from the artifacts (blast changed-symbol files + caller files +
  affected endpoints, plus smart-diff file paths / the PR's changed files); IF the model emits a path or
  endpoint that is not in that set, THEN that reference SHALL be dropped and NOT rendered as a clickable
  link. *Verify: unit*
- **AC-7** — The `review_focus[]` list SHALL be ordered by the model as "what to look at first" and each
  entry SHALL reference a real changed file present in the artifacts (per AC-6); an entry whose path
  fails validation SHALL be dropped rather than shown as a dead link. *Verify: unit*

### Cache & regenerate (G4)
- **AC-8** — WHEN `POST /pulls/:id/brief` is called and a cached brief exists whose stored `head_sha`
  equals the PR's current head, the system SHALL return the cached brief **without** a model call; the
  `completeStructured` call SHALL run only on a cache miss or via the Regenerate route (AC-9).
  *Verify: integration*
- **AC-9** — WHEN the user triggers Regenerate (`POST /pulls/:id/brief/regenerate`), the system SHALL
  re-run generation **bypassing the cache**, replace the cached brief, and replace the displayed brief —
  mirroring the intent getIntent/recalculate split (`intent/service.ts:46-71`, `server/INSIGHTS.md`).
  *Verify: e2e (pr-brief flow; number assigned at implementation time)*
- **AC-10** — IF the PR head SHA differs from the cached brief's stored `head_sha` (a nullable `head_sha`
  column on `pr_brief`, the exact `pr_intent` precedent, `intent/service.ts:51`,
  `server/src/db/schema/reviews.ts:57`), THEN the next `POST /pulls/:id/brief` SHALL be a cache miss and
  regenerate, rather than serving the stale brief. *Verify: integration*

### Client card (G5)
- **AC-11** — The **PrBriefCard** SHALL render the `what` and `why` narrative, the `risk_level` with a
  severity color, each risk with its severity and title/explanation, and the `review_focus[]` list where
  each entry links to its referenced file. *Verify: e2e (pr-brief flow; number assigned at implementation time)*
- **AC-12** — WHILE a brief is being generated (first load or Regenerate), the card SHALL show a loading
  state (not a blank); IF no brief is available or generation failed, THEN the card SHALL show an
  `EmptyState` with a Generate/Retry action, never a raw error. *Verify: unit (RTL)*

### Unhappy paths (degraded artifacts)
- **AC-13** — IF no cached intent exists for the PR, THEN the system SHALL generate the brief
  **best-effort with the intent section simply omitted** from the input (omit-when-empty, the
  `buildIntentDigest` returns-`undefined` precedent, `run-executor.ts:496-504`), and SHALL NOT return a
  409 or otherwise require intent to be generated first. *Verify: integration*
- **AC-14** — IF the blast index is degraded/absent (facade returns an empty best-effort result,
  `blast/service.ts:97-107`), THEN the real-reference set SHALL fall back to the smart-diff file paths /
  changed files and the brief SHALL still be generated (references grounded against whatever real paths
  exist). *Verify: integration*
- **AC-15** — IF the PR has no linked issue and/or no attached specs, THEN those sections SHALL be
  omitted from the prompt and the input SHALL remain valid — the prompt shape degrades gracefully rather
  than erroring. *Verify: unit*
- **AC-16** — IF the single `completeStructured` call fails or times out, THEN the endpoint SHALL return
  a 5xx (no partial brief persisted) and the client card SHALL degrade to the `EmptyState`/Retry state
  (AC-12), mirroring the intent error policy (`intent/service.ts:11-16`). This is the
  consciously-written unhappy-path counterpart of AC-4. *Verify: integration*

### Security (see Untrusted inputs & Non-functional)
- **AC-17** — WHEN the intent digest, linked-issue text, attached spec bodies, and blast-derived strings
  are placed in the prompt, each untrusted block SHALL be delimiter-wrapped with
  `wrapUntrusted`/`INJECTION_GUARD` (`@devdigest/reviewer-core`, the standard server-side wrap per
  `server/INSIGHTS.md`) and declared data-not-instructions, so injected text (e.g. an issue body saying
  "ignore instructions") does not steer generation. *Verify: unit*
- **AC-18** — WHEN the model's brief is rendered, it SHALL be treated as untrusted output: `what`/`why`/
  risk explanations rendered as markdown without raw HTML/script execution, model-emitted inline links
  neutralized to plain text, and only AC-6-validated file paths becoming clickable links — no
  model-emitted string reaches the DOM as executable HTML or an unvalidated `href`. *Verify: unit (RTL)*
- **AC-19** — WHILE resolving a brief, every PR / repo / agent / index query SHALL be scoped by
  `workspace_id` (IDOR-safe, per `server/CLAUDE.md` tenancy rule). *Verify: integration*
- **AC-20** — The brief generate / Regenerate route SHALL carry a tight per-route rate limit (each call
  makes an LLM generation), mirroring the intent recalculate limit (`intent/routes.ts:42`,
  `config: { rateLimit: { max: 10, timeWindow: '1 minute' } }`). *Verify: integration*

### Cost visibility (G7)
- **AC-21** — WHEN a brief is generated via the model call, the system SHALL persist its `cost_usd`
  (USD, from `StructuredResult.costUsd`, `adapters.ts:77`), token counts (in/out), and the model used
  **alongside the cached brief**, and the brief response SHALL expose them (`generated.{model, cost_usd,
  tokens_in, tokens_out}`), so cost is queryable per generation — SPEC-02 parity. The storage layout
  (dedicated columns vs. embedded in `pr_brief.json`) is the implementer's choice; the observable
  requirement is that the values are persisted per generation and present in the response. *Verify: integration*
- **AC-22** — IF the provider does not report a cost (`costUsd` is `null`, `adapters.ts:77`), THEN the
  system SHALL persist/expose the cost as `null` and SHALL NOT fail generation. *Verify: unit*

## Edge cases
- **Empty / no cached intent** — intent section omitted, brief generated best-effort (AC-13).
- **Degraded / empty blast index** — grounding set falls back to smart-diff/changed files; brief still
  generated (AC-14).
- **No linked issue / no attached specs** — those sections omitted, prompt still valid (AC-15).
- **Model failure / timeout** — 5xx, no partial cache write, client EmptyState/Retry (AC-16).
- **Loading** — first generation or Regenerate in flight → loading state, never blank (AC-12).
- **Model hallucinates a file/endpoint** — the reference is dropped, not rendered as a link (AC-6/AC-7).
- **Stale cache after new commits** — head SHA differs from stored `head_sha` → cache miss, regenerated
  (AC-10).
- **Input over budget** — deterministic truncation in fixed drop order, intent + blast summary never
  cut (AC-3/AC-3a).
- **Provider reports no cost** — persisted/exposed as `null`, generation still succeeds (AC-22).
- **Prompt injection via issue/spec text** — wrapped as data (AC-17); model output rendered
  non-executably (AC-18).

## Flows & module communication

```mermaid
sequenceDiagram
    participant UI as Client (PrBriefCard)
    participant API as Server (brief route)
    participant SVC as Brief service
    participant ART as Artifacts (intent/blast/smart-diff/issue/specs)
    participant LLM as LLMProvider.completeStructured

    UI->>API: POST /pulls/:id/brief  (or /brief/regenerate)
    API->>SVC: getBrief(workspaceId, prId) / regenerate(...)
    alt cached brief exists (and not Regenerate)
        SVC-->>UI: cached Brief (no model call)
    else cache miss or Regenerate
        SVC->>ART: read cached intent, blast summary, smart-diff groups, linked issue, attached specs
        ART-->>SVC: artifacts (zero model calls; NO diff hunks/file bodies)
        SVC->>SVC: assemble prompt, wrap untrusted blocks, enforce input budget
        SVC->>LLM: completeStructured(risk_brief, artifacts)  %% exactly one call
        alt call ok
            LLM-->>SVC: Brief { what, why, risk_level, risks[], review_focus[] }
            SVC->>SVC: validate file_refs / review_focus paths against real-reference set (drop invented)
            SVC-->>UI: Brief (persisted per PR)
        else call fails / times out
            SVC-->>UI: 5xx → card shows EmptyState/Retry
        end
    end
```

## Contracts (boundaries)

Field lists at the boundary — the implementer derives the Zod `vendor/shared` schema. The pre-scaffolded
stub `PrBrief { intent, blast, risks, history }` in `server/src/vendor/shared/contracts/brief.ts`
(`brief.ts:115-122`) SHALL be **reconciled in place** into the target `Brief` shape below (reusing
`RiskSeverity` for `risk_level` and `Risk` for `risks[]`); its `history` field — WhyTimeline scaffolding
— is **dropped** (WhyTimeline is NG1).

**Brief** (endpoint response — the L05 output; reconciles the `PrBrief` stub in place):

| Field | Type | Req | Notes |
|---|---|---|---|
| `pr_id` | string | yes | workspace-scoped |
| `what` | string (markdown) | yes | what the PR does |
| `why` | string (markdown) | yes | why it exists (grounded in intent/issue) |
| `risk_level` | enum `high` \| `medium` \| `low` | yes | reuses `RiskSeverity` (`brief.ts:47`); drives the card color |
| `risks` | `Risk[]` | yes | reuses `Risk` (`brief.ts:50-57`); `file_refs` validated per AC-6 |
| `review_focus` | `{ path: string, reason: string }[]` | yes | ordered "look here first"; each `path` validated per AC-6/AC-7 |
| `generated_at` | string (ISO) \| null | no | cached generation timestamp |
| `generated` | `{ model, cost_usd, tokens_in, tokens_out }` | no | persisted per generation, exposed on the response (AC-21); `cost_usd` may be `null` (AC-22) |

- **Server endpoints** (PR resolved from workspace context, workspace-scoped): `POST /pulls/:id/brief`
  (cached-or-generate, AC-8) and `POST /pulls/:id/brief/regenerate` (cache bypass, AC-9). Both carry the
  AC-20 rate limit.
- **Client**: a **PrBriefCard** on the PR detail page. Recommended placement is **full-width above** the
  Overview tab's Intent‖Blast two-column grid (`client/INSIGHTS.md`); the exact placement (full-width vs
  a dedicated tab) is a design/planner choice, not fixed by an AC.
- **Data**: cached in the pre-scaffolded `pr_brief` table (`reviews.ts:60-65`, `prId` PK + `json` jsonb),
  extended with a **nullable `head_sha`** column (exact `pr_intent` precedent, `reviews.ts:57`) for
  AC-10 invalidation. Persisted cost/tokens/model (AC-21) may live in `pr_brief.json` (no extra columns
  required). Altering this empty pre-scaffolded table is safe per `server/INSIGHTS.md`; do not delete it.

## Non-functional
- **Cost/observability** — WHEN a brief is generated via the model, the generation cost (USD, from
  `StructuredResult.costUsd`, `adapters.ts:77`), tokens in/out, and the model SHALL be recorded in the
  run logs **and persisted with the cached brief and exposed on the response** (AC-21/AC-22).
  *Verify: integration*
- **Performance** — A cached brief SHALL be served without a model call (AC-8), so repeat page opens do
  not incur generation latency; artifact reads are DB/facade reads, not model calls (AC-2).
  *Verify: manual*
- **Input budget** — The assembled model input SHALL stay within the fixed ≤ 8000-token budget via
  deterministic truncation (AC-3/AC-3a); no diff hunks/file bodies ever enter the prompt (NG2), keeping
  the call cheap. *Verify: unit*
- **Security** — covered by AC-6, AC-17..AC-20 and *Untrusted inputs*.
- **a11y** — The PrBriefCard (risk badge, review-focus links, Regenerate) SHALL be keyboard-operable,
  consistent with existing PR-page panels (IntentPanel/BlastPanel). *Verify: manual*

## Inputs (provenance)
- Cached intent — **[reused: L03 intent]** `IntentRepository.getByPr` (`intent/service.ts:50`,
  `run-executor.ts:496-506` cached-read precedent).
- Blast-radius summary + real symbols/callers/endpoints — **[reused: L04 blast]**
  `container.repoIntel.getBlastRadius` (`blast/service.ts:34`); the real-reference grounding set for AC-6.
- Smart-diff groups & stats by role — **[reused: L03 smart-diff]** DB-only `SmartDiffService`
  (`smart-diff/service.ts:19-85`).
- Linked issue title+body — **[reused: L03 intent]** `extractLinkedIssueNumber` + `github.getIssue`
  (`intent/service.ts:96-105`).
- Attached project-context specs — **[reused: SPEC-01 context]** the `buildSpecBlocks` clone-read pattern
  (`run-executor.ts:386-444`), applied to the **union of context-attached specs across all workspace
  agents**, deduped by path (AC-2a).
- The brief itself — **[new: 1 LLM call]** `completeStructured` (`adapters.ts:82-89`) using the
  `risk_brief` feature-model (`platform.ts:58-64`); provider/model via `resolveFeatureModel`
  (`intent/service.ts:113-117` precedent). **No pre-drafted brief prompt exists** in
  `server/src/prompts/` (only `onboarding.system.md`) — the system prompt is new work.
- Cache + Regenerate split — **[reused: L03 intent]** getIntent/recalculate → generateAndStore
  (`intent/service.ts:46-148`, `server/INSIGHTS.md`).
- Untrusted wrapping — **[reused]** `wrapUntrusted`/`INJECTION_GUARD` (`server/INSIGHTS.md`;
  `intent/generate.ts`, `onboarding/prompt.ts` precedents).
- Cache storage — **[reused: pre-scaffolded]** `pr_brief` table (`reviews.ts:60-65`), extended with a
  nullable `head_sha` (AC-10) and persisted cost/tokens/model (AC-21).

## Untrusted inputs
**Yes — this feature reads third-party/repo-derived text into an LLM prompt AND renders model output in
the UI.** Two trust boundaries:
- **Artifacts → model (input):** the intent digest, linked-issue title/body, attached spec bodies, and
  blast/smart-diff-derived strings originate outside DevDigest's trust boundary. Each is
  delimiter-wrapped with `wrapUntrusted`/`INJECTION_GUARD` and declared data-not-instructions (AC-17);
  an issue/spec that says "ignore previous instructions" is analyzed as data, not obeyed. No diff hunks
  or file bodies are ever included (NG2), shrinking the injection surface.
- **Model → UI (output):** `what`/`why`/risk explanations and `review_focus` reasons are model-generated
  and untrusted. They are rendered non-executably — markdown without raw HTML/script, model-emitted
  inline links neutralized to plain text (the `react-markdown` `a`→`span` override precedent,
  `client/INSIGHTS.md`) — and only AC-6-validated real file paths become clickable links (AC-18).
- All PR/repo/agent/index resolution is `workspace_id`-scoped (AC-19); the generate/Regenerate route is
  rate-limited (AC-20).

## Changelog
- 2026-07-13 — Initial draft (SPEC-03).
- 2026-07-13 — Folded user answers to all 7 open questions (status stays draft): input budget = ≤ 8000
  tokens via `container.tokenizer` with a fixed drop order, intent + blast summary never truncated
  (AC-3, AC-3a); attached specs = union across all workspace agents, deduped by path (AC-2a); cache
  invalidation via a nullable `head_sha` on `pr_brief`, head change → regenerate (AC-10); endpoints
  `POST /pulls/:id/brief` + `POST /pulls/:id/brief/regenerate` (AC-8, AC-9); cost/tokens/model persisted
  with the cached brief and exposed on the response, storage layout implementer's choice (AC-21, AC-22,
  G7); missing intent → best-effort omit (AC-13); reconciled the pre-scaffolded `PrBrief` stub in place
  into `Brief { what, why, risk_level, risks[], review_focus[] }`, dropped `history` (WhyTimeline, NG1),
  `review_focus` item = `{ path, reason }`. Removed the [NEEDS CLARIFICATION] section. e2e flow number
  deferred to implementation time; card placement kept a Contracts/planner note.
- 2026-07-13 — Status: draft → approved (user approval; Definition of Ready verified in the clarification round).
