# Development Plan: Intent Layer

## Context / Problem

On a Pull Request's **Overview** tab we want an **INTENT** panel that explains *why* a PR was
opened, so reviewers get motivation/scope/risk framing before diving into findings. The panel has
three sub-sections:

1. **Intent** — one-sentence motivation quote.
2. **In scope / Out of scope** — two bullet lists.
3. **Risk areas** — a row of non-interactive chips (e.g. "Auth surface touched", "New dependency:
   ioredis").

A **cheap LLM** (`openrouter` / `deepseek/deepseek-v4-flash`) reasons over the PR title + body, any
linked plan/specification, and the code diff. **Graceful degradation is a hard requirement**:
when the body has no linked plan/issue the feature must still infer intent from implicit signals
(title + diff + changed files) and must never error or block on missing docs.

### Motivation sources (priority order — a present plan/spec is AUTHORITATIVE)

The generation prompt MUST treat an explicit plan or specification as the strongest signal and
derive the intent quote + in/out-of-scope directly from it (not from the diff) when one is present:

1. **Inline plan/spec in the PR body** — if the body itself contains the plan/spec text (common for
   AI-authored PRs), it is already fed in via `pull.body`; the prompt must recognise and prioritise it.
2. **Linked GitHub issue/PR** — a `#N` reference **or a full GitHub issue/PR URL** in the body →
   resolve via `GitHubClient.getIssue` and feed the issue title + body as the spec. (Extend the
   existing `#N`-only regex to also match `https://github.com/<owner>/<repo>/issues/<n>` URLs.)
3. **Implicit (no plan/spec)** — infer intent from title + changed files + diff. Must never error.

**Out of scope for this slice (note, don't implement):** fetching arbitrary **external** URLs (SSRF
risk — needs `security` review) and reading **in-repo** spec files referenced by relative path from
the local clone. Both are follow-ups; the inline-plan and linked-GitHub-issue cases above cover the
common DevDigest scenarios. Flagged so the implementer does not silently skip the requirement.

The intent is auto-generated on Overview tab load, persisted to `pr_intent`, served cached on
subsequent loads, and regenerated when the PR head SHA changes (a stored intent for a stale SHA is
treated as a cache miss).

**Out of scope (locked):** Blast Radius is a separate panel — not part of this plan. Ticket parsing
stays GitHub `#N` only (no Jira/Linear).

## What already exists vs. what's new

**Reuse as-is (do NOT rebuild):**

- **Contracts** (`server/src/vendor/shared/contracts/`): `Intent` (`brief.ts:9`), `Risk` + `Risks`
  (`brief.ts:50-62`), `PrIntentRecord = Intent.extend({ pr_id })` (`review-api.ts:60`).
  `IssueMeta` (`platform.ts:200`).
- **Feature-model registry**: `FEATURE_MODELS` already has a `review_intent` entry
  (`platform.ts:51-57`, currently `openai`/`gpt-4.1`). Resolver `resolveFeatureModel(container,
  workspaceId, 'review_intent')` (`server/src/modules/settings/feature-models.ts:51`). Client mirror:
  `client/src/app/settings/[section]/_components/SettingsView/_components/SettingsModels/constants.ts:21`.
- **Prompt-injection hardening**: `wrapUntrusted()` + `INJECTION_GUARD` in
  `reviewer-core/src/prompt.ts` (exported from `reviewer-core/src/index.ts`). REUSE to wrap the
  untrusted PR body / issue / diff.
- **Inputs**: PR `body` persisted at `pullRequests.body` (`server/src/db/schema/pulls.ts:26`);
  `headSha` / `lastReviewedSha` on the same table. `getIssue(repo, n)` is **public** on the
  `GitHubClient` interface (`server/src/vendor/shared/adapters.ts:164`, implemented in
  `octokit.ts:351` and `mocks.ts:233`). Diff via `loadDiff(container, reviewRepo, ws, pull,
  repoRow)` (`server/src/modules/reviews/diff-loader.ts:12`), with a `pr_files.patch` fallback.
- **LLM call**: `container.llm(provider)` (`container.ts:169`) → `LLMProvider.completeStructured<T>({
  model, schema, schemaName, messages })` (`adapters.ts:86`). Modeled on the conventions service
  (`server/src/modules/conventions/service.ts:67-78`).
- **Client**: PR detail page renders `<OverviewTab prBody={pr.body} />`
  (`client/src/app/repos/[repoId]/pulls/[number]/page.tsx:137`). UI kit primitives `Card`,
  `SectionLabel`, `Badge`, `Skeleton`, `EmptyState`, `Icon` from `@devdigest/ui`. Data hooks in
  `client/src/lib/hooks/`; `api.get<T>(path)` from `@/lib/api`.

**New:**

- A new server module `server/src/modules/intent/` (route + service + repository).
- A new pure `generateIntent()` function in `reviewer-core`.
- Two new columns on `pr_intent` (`risks`, `head_sha`) + one migration.
- A `risks` field added to the `PrIntentRecord` transport contract.
- A `useIntent` hook + an `IntentPanel` component wired into `OverviewTab`.
- The `review_intent` default flipped to the cheap model.

**Dead scaffolding (resolved → remove in this slice, task C4):** `upsertIntent` / `getIntent` exist
in the **reviews** module (`reviews/repository/pull.repo.ts:49-68`, surfaced on
`reviews/repository.ts:130-135`) but are called by nobody, and they don't know about risks or the SHA
cache key. The new intent module owns `pr_intent` via its own repository; the redundant
reviews-module helpers are deleted (decision confirmed — "delete unused code directly").

## Affected modules & layers

- **`server/src/vendor/shared/` (contracts)** — extend `PrIntentRecord`; flip `review_intent`
  default. (Do-Not-Touch zone — see Risks.)
- **`reviewer-core/`** — new pure `generateIntent()` (domain/engine layer; LLM injected, stays pure).
- **`server/`** — new `modules/intent/` (route = boundary, service = application, repository =
  data-access); `db/schema/reviews.ts` + migration; register in `modules/index.ts`.
- **`client/`** — new hook (`lib/hooks/`, infrastructure), new `IntentPanel` client component
  co-located under `OverviewTab/_components/`, wired into the existing client `OverviewTab`.

## Data model changes

Extend the existing **`pr_intent`** table (`server/src/db/schema/reviews.ts:48-55`) — it is empty
(unused future-lesson scaffolding), so adding columns is safe (precedent: the conventions lesson
altered its empty table). Add:

- `risks jsonb NOT NULL DEFAULT '[]'::jsonb` typed `$type<Risk[]>()` — stores the risk-area chips.
- `head_sha text NOT NULL` — the cache key; the SHA the stored intent was generated against.

Only **adding** columns (no drop) → `drizzle-kit generate` is non-interactive (per `server/INSIGHTS.md`
the interactive prompt only fires when a table gains AND drops columns in one change). Run `pnpm
db:generate` then `pnpm db:migrate` (manual — server does not auto-migrate).

## API contracts

- **Transport (extend, both copies in sync):** `PrIntentRecord = Intent.extend({ pr_id: z.string(),
  risks: z.array(Risk) })` in `…/contracts/review-api.ts` (add `Risk` to the existing import from
  `./brief.js`). This is the GET response.
- **Generation (new, reviewer-core internal — NOT in vendor/shared):** `IntentDraft = Intent.extend({
  risks: z.array(Risk) })` — a single object schema for `completeStructured` (tool inputs MUST be
  objects per `server/INSIGHTS.md`). `head_sha` is server-internal and is **not** in the response.
- **Endpoint:** `GET /pulls/:id/intent` → `PrIntentRecord`. Behavior: load stored row; if it exists
  AND `row.head_sha === pull.headSha` → return cached; else generate (cheap LLM), upsert with the
  current `headSha`, return. On a genuine LLM/provider error the route lets the error propagate
  (→ 5xx) so the client hook surfaces `isError` and the panel degrades (it does not crash the page).

## Tasks

| # | Task | Module/Layer | Files (paths) | Required skills (in order) | Parallel group | Tests |
|---|------|--------------|---------------|----------------------------|----------------|-------|
| A1 | Flip `review_intent` default to `openrouter`/`deepseek/deepseek-v4-flash`; keep client mirror in sync | shared contracts + client constants | `server/src/vendor/shared/contracts/platform.ts` (review_intent entry ~L51-57), `client/src/vendor/shared/contracts/platform.ts` (same targeted edit), `client/src/app/settings/[section]/_components/SettingsView/_components/SettingsModels/constants.ts` (~L21-27) | `zod` | A | Existing `server/test/contracts.test.ts` still green; verify Settings → Feature Models shows the new default |
| A2 | Add `risks` to `PrIntentRecord` | shared contracts | `server/src/vendor/shared/contracts/review-api.ts` (import `Risk`; extend at L60), `client/src/vendor/shared/contracts/review-api.ts` (same targeted edit) | `zod` | A | Contract round-trip in any `contracts.test.ts` mock includes `risks` |
| A3 | Add `risks` + `head_sha` columns to `pr_intent`; generate migration | server / schema | `server/src/db/schema/reviews.ts` (L48-55), generated `server/drizzle/<n>_*.sql` | `postgresql-table-design` → `drizzle-orm-patterns` | A | Migration applies cleanly; column types/defaults correct |
| B1 | Pure `generateIntent()` + intent prompt builder + `IntentDraft` schema; export from barrel | reviewer-core / engine (pure) | `reviewer-core/src/intent/generate.ts` (new), `reviewer-core/src/index.ts` (export) | `security` → `typescript-expert` | B | Unit: no-docs degradation path; spec-present path (MockLLMProvider) |
| C1 | Intent repository: `getByPr` (row incl. `headSha`/`risks`), `upsert` (with `headSha`+`risks`); PR/repo/diff lookups reuse `ReviewRepository` + `loadDiff` | server / data-access | `server/src/modules/intent/repository.ts` (new) | `onion-architecture` → `drizzle-orm-patterns` | C | Covered via C3 integration test |
| C2 | Intent service: resolve feature model, load PR+diff, extract linked issue (`#N` from stored body → `getIssue`, try/catch graceful), call `generateIntent`, SHA cache check, persist | server / application | `server/src/modules/intent/service.ts` (new) | `onion-architecture` → `security` | C (after C1) | Covered via C3 |
| C3 | Route `GET /pulls/:id/intent` (zod type-provider) + register module | server / boundary | `server/src/modules/intent/routes.ts` (new), `server/src/modules/index.ts` (register) | `fastify-best-practices` → `onion-architecture` | C (after C2) | Integration `*.it.test.ts`: cache hit vs regenerate-on-new-SHA; degradation (no linked issue) |
| C4 | Remove redundant dead `upsertIntent`/`getIntent` from the reviews module | server / data-access | `server/src/modules/reviews/repository/pull.repo.ts` (L49-68), `server/src/modules/reviews/repository.ts` (L130-135) | `onion-architecture` | C (after C1 owns `pr_intent`) | `pnpm typecheck` + reviews-module tests still green (confirms no live caller) |
| D1 | `useIntent(prId)` TanStack Query hook | client / lib infra | `client/src/lib/hooks/intent.ts` (new) + barrel `client/src/lib/hooks/index.ts` | `frontend-architecture` → `next-best-practices` | D | Covered via D2 (mock hook) |
| D2 | `IntentPanel` component (Intent quote + scope lists + risk chips) with loading / populated / degraded states | client / UI (client component) | `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/IntentPanel/` (`IntentPanel.tsx`, `index.ts`, `styles.ts`) | `frontend-architecture` → `react-best-practices` | D | RTL: loading (Skeleton), populated (quote+lists+chips), degraded/empty (EmptyState) |
| D3 | Wire `IntentPanel` into `OverviewTab` | client / UI | `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx` | `frontend-architecture` → `react-best-practices` | D (after D1+D2) | OverviewTab renders panel above Description; existing description still shows |

## Implementation sequence

1. **Dispatch Group A (A1, A2, A3) and Group B (B1) in parallel** — all touch disjoint files and
   share no dependencies. A = contracts + schema/migration; B = the pure reviewer-core function.
2. **Group C (server module), sequential within the group, after A2 + A3 + B1.** C1 (repository) →
   C2 (service, also needs B1) → C3 (route + registration, needs A2). C1 could start as soon as A3
   lands; C2/C3 follow. Run `pnpm db:migrate` before C3's integration test.
3. **Group D (client), after A1/A2 contracts exist; the endpoint (C3) should be live for end-to-end,
   but D1 and D2 can be built in parallel against the contract types first.** D1 (hook) ‖ D2 (panel,
   tested with a mocked hook) → D3 (wire into OverviewTab).

So two waves can run concurrently up front (A ‖ B), then C, then D — with D1‖D2 parallel inside D.

## Known gotchas (from INSIGHTS)

- `completeStructured({ schema })` forces tool-use and **tool inputs MUST be objects** — a bare
  `z.array` fails. Use the object `IntentDraft` (intent + scope + `risks`). It auto-retries on
  schema-validation failure and throws `ExternalServiceError` (clean 5xx) after `maxRetries`; do not
  hand-parse JSON. (`server/INSIGHTS.md`)
- `fastify-type-provider-zod`: a response-schema mismatch throws **500, not 422** — the route's
  returned object must exactly match `PrIntentRecord` (include `risks`). (`server/INSIGHTS.md`)
- Shared contracts live in **both** `server/src/vendor/shared/` and `client/src/vendor/shared/` and
  must change in sync; apply the **same targeted edit** to the client copy — do NOT overwrite the
  client file from the server copy (it may carry intentional drift). Any new contract field must be
  added to **all** test mock factories (e.g. `contracts.test.ts`), even as `[]`/`null`.
  (`server/INSIGHTS.md`, `client/INSIGHTS.md`)
- The client cannot import the runtime `FEATURE_MODELS` value (webpack can't resolve the
  `vendor/shared` barrel) — the **`SettingsModels/constants.ts` mirror is what actually renders**.
  Update server `platform.ts`, the client `vendor/shared` copy (sync), AND `constants.ts`.
  (`client/INSIGHTS.md`)
- `drizzle-kit generate` is interactive only when a table gains **and** drops columns at once; A3
  only adds, so it runs non-interactively. Always `db:generate` before `db:migrate`.
  (`server/INSIGHTS.md`)
- `@testing-library/user-event` is **not installed** — use `fireEvent` from `@testing-library/react`.
  Wrap components using `next-intl` in `<NextIntlClientProvider locale="en" messages={…}>` if the
  panel pulls i18n strings. Style via co-located `styles.ts` inline-style objects with CSS vars (this
  repo does not use Tailwind utility classes in app code). (`client/INSIGHTS.md`)
- Use `Badge`/`span` for the **non-interactive** risk chips — `Chip` in the UI kit is a `<button>`.
  Map `Risk.severity` to the existing `--crit/--warn/--sugg` CSS vars for chip color. (product note +
  `client/INSIGHTS.md`)
- `INJECTION_GUARD` is appended to agent prompts automatically inside `assemblePrompt`, but
  `generateIntent` builds its own messages — it must **explicitly** include the guard in its system
  prompt and wrap every untrusted input (title, body, issue, diff, file list) with `wrapUntrusted()`.
  (`reviewer-core/INSIGHTS.md`)

## Resolved decisions (confirmed by product owner)

1. **Do-Not-Touch exceptions — APPROVED.** The additive, mirrored edits to `server/src/vendor/shared/`
   (flip `review_intent` default in `platform.ts`; add `risks` to `PrIntentRecord`) and the additive
   columns on the empty `pr_intent` table are sanctioned. No deletions in those zones (the C4 deletion
   is in the reviews **module**, not schema/contracts).
2. **`risks` on `PrIntentRecord`** — extend the existing record (not a new contract).
3. **Degradation on LLM/provider failure** — route propagates the error (→ 5xx); the panel renders a
   non-blocking `EmptyState` while the rest of Overview still shows. `intent` stays **required** in the
   contract (no nullable churn). "Degrade in the UI, don't crash the page."
4. **`head_sha NOT NULL`** — confirmed; every write supplies a SHA.
5. **Trigger** — lazy: panel mounts → `useIntent` → `GET /pulls/:id/intent` generates-if-missing-or-stale.
   No background/eager job.
6. **Linked-issue / no-token** — reuse the `#N` regex on stored `pull.body` → `GitHubClient.getIssue`;
   catch `ConfigError` from `container.github()` so no-token environments degrade to title+diff inference.
7. **Dead scaffolding** — REMOVE the redundant reviews-module `upsertIntent`/`getIntent` (task C4).

## Definition of Done

- `pnpm typecheck` passes in `server/`, `client/`, and `reviewer-core/`.
- New tests written and passing: reviewer-core unit (no-docs degradation + spec-present), server
  integration (cache hit vs regenerate-on-new-SHA + degradation), client RTL (loading / populated /
  degraded). Existing `contracts.test.ts` mocks updated for the new `risks` field.
- `pnpm db:migrate` applies the `pr_intent` migration cleanly.
- The INTENT panel renders on the Overview tab: motivation quote, in/out-of-scope lists, risk chips;
  cached on reload; regenerated when the head SHA changes; degrades to an EmptyState on failure
  without crashing the page.
- `review_intent` defaults to `openrouter`/`deepseek/deepseek-v4-flash`, still overridable in
  Settings → Feature Models, with the client mirror in sync.
- Scope respected (no Blast Radius, no Jira/Linear parsing); Do-Not-Touch honored except the
  sanctioned, confirmed vendor/shared + schema additions above.
