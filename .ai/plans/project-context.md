# Implementation Plan: Project Context

**Spec:** `specs/SPEC-01-project-context-2026-07-12.md` | **Spec ID:** SPEC-01 | **Status at planning time:** approved
**Execution mode:** multi-agent

## Acceptance criteria (from the spec)
| AC | Criterion | Covered by task(s) |
|----|-----------|--------------------|
| AC-1 | Discovery returns every `.md` under a configured root segment at any depth, each with path/folder_type/size/tokens/mtime. | T5 |
| AC-2 | Root folder names read from server config (default `specs,docs,insights`); matched as exact case-sensitive segments. | T3, T5 |
| AC-3 | Exclude standard ignored dirs (`node_modules`,`.git`,`dist`,`build`,`coverage`,`.next`,`out`,`vendor`). | T5 |
| AC-4 | Discovery does NOT follow symlinks. | T5 |
| AC-5 | Never-cloned repo → deterministic "not available" (empty list + reason), not a 500. | T5 |
| AC-6 | Page renders each doc row (relative path + folder badge) and a read-only markdown preview of the selected doc. | T8 |
| AC-7 | Rescan re-walks the clone and returns current `ContextDoc[]`; discovery is fresh/uncached per request. | T5 (walk), T8 (action) |
| AC-8 | Page loading / empty (names roots) / error (AC-5) states; never a blank screen. | T8 |
| AC-9 | Page shows NO edit mode, "+"/upload/new-folder toolbar, coverage badge, or "Indexed…" stats (NG1–NG3). | T8 (manual) |
| AC-10 | Agent Context tab: per-doc row with drag handle, checkbox, name, path, folder badge, Preview, "Filter documents…". | T9 |
| AC-11 | Context tab header shows "N of M attached". | T9 |
| AC-12 | Reorder persists; earlier docs appear earlier in the assembled `## Project context` block. | T2 (persist), T5 (order read), T6 (assembly order), T9 (UI) |
| AC-13 | Per-doc + total estimated token count (server tokenizer) shown in the tab. | T5 (tokenize), T9 (UI) |
| AC-14 | Filter shows only docs whose name/path matches, without losing attached/order state of hidden docs. | T9 |
| AC-15 | Skill editor "Project context to use" section equivalent to the agent Context tab. | T10 |
| AC-16 | An agent's enabled skill (both `skills.enabled` and `agent_skills.enabled`) with attached docs → agent inherits them at run time. | T5 (resolve), T6 (run-time) |
| AC-17 | Agent/skill metadata stores only ordered doc PATHS; doc text never embedded in config/prompts/version snapshots. | T1 (shape), T2 (schema), T5 (repo), T6 |
| AC-18 | An attached path that no longer resolves still renders the row (marked missing), not an error. | T9, T10 |
| AC-19 | Injected list = agent docs (stored order) then skill-inherited, deduped by path keeping first occurrence. | T6 |
| AC-20 | Read each doc fresh from the clone at run time and fill `PromptParts.specs` (`## Project context`). | T6 |
| AC-21 | No attach + no inherit → omit the section entirely; prompt byte-identical to pre-feature. | T6 |
| AC-22 | Zero LLM/model calls across the whole feature. | T5, T6 (verify integration) |
| AC-23 | Trace Configuration records `specs_read` = ordered injected doc paths. | T6 |
| AC-24 | Trace records structured `spec_blocks: {path,tokens,body}[]` on `PromptAssembly`, rendered in prompt-assembly view. | T1 (contract), T6 (populate), T11 (render) |
| AC-25 | Agent with an attached invariant spec flags a violating PR, referencing the spec. | Manual verification (no dedicated task — end-to-end feature behavior; see DoD) |
| AC-26 | Each injected doc wrapped in the untrusted delimiter block (`wrapUntrusted`); treated as data. | Existing `prompt.ts:105` + T6 (feeds it); T4 (guard) |
| AC-27 | Path resolving outside the clone (`..`, absolute, symlink escape) refused: rejected at attach, skipped at run. | T5 (attach + preview guard), T6 (run skip) |
| AC-28 | Path missing at run time (deleted/renamed) → skip that doc, inject rest, record skipped path, run does not fail. | T6 |
| AC-29 | Every repo/agent/skill context query scoped by `workspace_id` (IDOR-safe). | T5 |
| AC-30 | `INJECTION_GUARD` enumerates project-context / attached specs among its named untrusted sources. | T4 |

Non-goals NG1–NG6 are hard scope boundaries, not tasks (read-only page; no coverage badge; no chunking/embedding/index stats; no auto-selection; no L06 conformance gate; no doc write/move/delete/upload).

## Affected modules & layers
- **reviewer-core** (pure): `src/prompt.ts` — `INJECTION_GUARD` text only (specs threading already wired end-to-end via `run.ts:140` + `run.ts:179`; injected in both single-pass and map-reduce).
- **server/src/vendor/shared** (domain/contracts): `contracts/platform.ts`, `contracts/trace.ts`.
- **server** — new **context** module (Application `service.ts` + Infrastructure `repository.ts`/pure `walk.ts` + Presentation `routes.ts`), wired in **composition root** `platform/container.ts` + `modules/index.ts`; config in `platform/config.ts`; injection in `modules/reviews/run-executor.ts` (+ pure helper). Infrastructure: `db/schema/agents.ts` + `db/schema/skills.ts` + a generated migration.
- **client** (Next.js App Router): data hooks (`lib/hooks`), new repo-scoped `/context` page, agent-editor Context tab (RSC/client boundary: interactive → `"use client"`), skill-editor context section, trace prompt-assembly rendering, nav.
- **client/src/vendor/shared** (synced copy of the contracts).

## Data model changes
Two new attachment join tables (paths-only), mirroring `agent_skills` (`db/schema/agents.ts:51-68`). No workspace_id column — scoped via the agent/skill ownership check (same as `agent_skills`).

- `agent_context` — `agent_id uuid FK→agents(onDelete cascade)`, `path text NOT NULL`, `order integer NOT NULL DEFAULT 0`, PK `(agent_id, path)`. → `db/schema/agents.ts`.
- `skill_context` — `skill_id uuid FK→skills(onDelete cascade)`, `path text NOT NULL`, `order integer NOT NULL DEFAULT 0`, PK `(skill_id, path)`. → `db/schema/skills.ts`.
- One generated Drizzle migration adds both (new tables only — non-interactive `db:generate`).

No change to the pre-scaffolded `context.ts` schema (codeChunks/symbols/references/onboarding) — those stay untouched (Do-Not-Touch). `ContextDoc` and the discovery walk are stateless; the doc list is NOT persisted (AC-7).

## API contracts
Derived as Zod schemas in `vendor/shared/contracts/platform.ts` (synced to both server + client copies).
- **`ContextDoc`**: `{ path: string, folder_type: enum('specs'|'docs'|'insights'), size_bytes: int, tokens: int, updated_at?: string }` — **replaces** `SpecFile`.
- **`ContextPreview`**: `{ path: string, content: string }` — on-demand per-doc preview.
- **`AgentContextLink`** / **`SkillContextLink`**: `{ agent_id|skill_id: string, path: string, order: int }` (mirror `AgentSkillLink`, `knowledge.ts:342-350`).
- **`SetContextBody`**: `{ docs: { path: string, order: int }[] }` (set/replace the ordered set).
- **Remove `IndexStatus`** (embedding-flavored; NG3).
- Trace: add `spec_blocks: z.array(SpecBlock).nullish()` to `PromptAssembly` where `SpecBlock = { path, tokens, body }` (mirrors `SkillBlock`, `trace.ts:39-45`); `specs_read` already exists (`trace.ts:102`).

Endpoints (context module `routes.ts`):
- `GET /repos/:repoId/context` → `ContextDoc[]` (fresh walk; AC-5 returns `[]` + reason).
- `POST /repos/:repoId/context/preview` `{ path }` → `ContextPreview` (path validated in-clone; **POST chosen so the repo-relative path with `/` needs no URL encoding** — decided).
- `GET /agents/:id/context` → `AgentContextLink[]`; `POST /agents/:id/context` `SetContextBody` → replace ordered set (mirror `agents/routes.ts:154-187`).
- `GET /skills/:id/context` → `SkillContextLink[]`; `POST /skills/:id/context` `SetContextBody` → replace ordered set.

**Config:** `CONTEXT_ROOTS` env (default `specs,docs,insights`) on `EnvSchema`, surfaced as `contextRoots: string[]` on `AppConfig` (`config.ts:15-81`).

## Tasks
| # | Task | Covers | Module/Layer | Files (paths) | Required skills (in order) | Parallel group | Tests |
|---|------|--------|--------------|---------------|----------------------------|----------------|-------|
| T1 | Shared contracts: add `ContextDoc`, `ContextPreview`, `AgentContextLink`, `SkillContextLink`, `SetContextBody`, `SpecBlock`; add `spec_blocks` to `PromptAssembly`; remove `IndexStatus`, replace `SpecFile`. Sync BOTH copies (targeted edits). | AC-17, AC-24 | Domain / contracts | `server/src/vendor/shared/contracts/{platform.ts,trace.ts}`, `client/src/vendor/shared/contracts/{platform.ts,trace.ts}`, barrel comments in both `index.ts` | `zod` → `typescript-expert` | **G1** | `server/test/contracts.test.ts` (unit) |
| T2 | DB schema + migration: `agent_context` (in `agents.ts`), `skill_context` (in `skills.ts`); generate migration. | AC-12, AC-17, AC-29 | Infrastructure / DB | `server/src/db/schema/{agents.ts,skills.ts}`, generated `server/src/db/migrations/NNNN_*.sql` | `drizzle-orm-patterns` → `postgresql-table-design` | **G1** | none (schema; exercised by T5/T6 integration) |
| T3 | Config: add `CONTEXT_ROOTS` env → `contextRoots: string[]` on `AppConfig`. | AC-2 | Composition / platform | `server/src/platform/config.ts` | `onion-architecture` | **G1** | co-located `config` unit if present (unit) |
| T4 | reviewer-core: extend `INJECTION_GUARD` to name project-context / attached specs among untrusted sources. | AC-26, AC-30 | reviewer-core (pure) | `reviewer-core/src/prompt.ts` | `security` | **G1** | `reviewer-core/test/prompt.test.ts` (unit) |
| T5 | Context module: pure `walk.ts` (full tree walk per request, root-segment match at any depth, exclude ignored dirs, no symlinks, .md only) → `service.ts` (walk + tokenize via `container.tokenizer`, guarded read for preview + attach validation, not-cloned handling, workspace-scoped, agent/skill link CRUD) → `repository.ts` (`agent_context`/`skill_context`) → `routes.ts`; register in `modules/index.ts` + wire in `container.ts`. **Path resolve uses the guarded `resolve(root,rel)`-stays-under-`resolve(root)` pattern (NOT `readClone`) + a 400 KB read cap reusing the existing `MAX_FILE_SIZE` value (skip + record files above it).** | AC-1, AC-2, AC-3, AC-4, AC-5, AC-7, AC-13, AC-16, AC-17, AC-22, AC-27, AC-29 | Application + Infra + Presentation + composition | `server/src/modules/context/{walk.ts,service.ts,repository.ts,routes.ts,index.ts}`, `server/src/modules/index.ts`, `server/src/platform/container.ts` | `onion-architecture` → `fastify-best-practices` → `drizzle-orm-patterns` → `security` | **G2** | `context/walk.test.ts` (unit), `context/*.it.test.ts` (integration, testcontainers) |
| T6 | Run-time injection: pure `context-blocks.ts` (concat agent-order-first + skill-inherited, dedupe-by-path keep-first) + `run-executor.ts` — resolve paths (agent links + enabled-skill links via context repo, mirror `buildSkillBlocks`), guarded fresh read (same guard + 400 KB `MAX_FILE_SIZE` cap as T5) + tokenize, skip missing/unsafe (record in trace/log), pass `specs` to `reviewPullRequest` omit-when-empty, populate `specs_read` + `spec_blocks` in the trace (both success `run-executor.ts:274-306` and the CI/error trace at `:490-508`). | AC-12, AC-16, AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-26, AC-28 | Application | `server/src/modules/reviews/{run-executor.ts,context-blocks.ts}` | `onion-architecture` → `security` | **G2** (after T5) | `reviews/context-blocks.test.ts` (unit: dedupe/order/omit), `reviews/*.it.test.ts` (integration: injection + specs_read + spec_blocks + skip missing + zero LLM) |
| T7 | Client data hooks: reshape `useContextFiles`→`ContextDoc[]`, `useReindexContext`→rescan (invalidate/refetch), add `useContextPreview`, `useAgentContext`/`useSetAgentContext`, `useSkillContext`/`useSetSkillContext`. | (data layer for AC-6/7/10/11/13/15/18) | Client / lib | `client/src/lib/hooks/core.ts` (or new `lib/hooks/context.ts` + barrel) | `frontend-architecture` → `react-best-practices` | **G3** | co-located hook tests if applicable (RTL) |
| T8 | Repo-scoped read-only `/context` page (mirror Conventions page; `useActiveRepo()`, `_components/` co-location): doc list rows (path + folder badge), read-only markdown preview (`vendor/ui/primitives/Markdown.tsx`), rescan action, loading/empty(names roots)/error states; NO edit/toolbar/coverage/index stats. Add nav entry to `vendor/ui/nav.ts` (`activeKeyFor('/context')` already maps). | AC-6, AC-7, AC-8, AC-9 | Client / page (RSC boundary) | `client/src/app/context/{page.tsx,_components/**}`, `client/src/vendor/ui/nav.ts` | `frontend-architecture` → `next-best-practices` → `security` | **G4** (after T7) | page/state tests (RTL, unit); e2e project-context (AC-6) |
| T9 | Agent-editor **Context** tab (mirror SkillsTab: dnd-kit reorder, checkbox attach, filter, per-row Preview, folder badge, "N of M attached", per-doc + total tokens, missing-path row); register tab in `AgentEditor/constants.ts` TABS + `agents/[id]/page.tsx` VALID_TABS. | AC-10, AC-11, AC-12, AC-13, AC-14, AC-18 | Client / component | `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/**`, `client/src/app/agents/[id]/_components/AgentEditor/constants.ts`, `client/src/app/agents/[id]/page.tsx` | `frontend-architecture` → `react-best-practices` | **G4** (after T7) | ContextTab tests (RTL: N-of-M, filter, missing, tokens) |
| T10 | Skill-editor **"Project context to use"** section (equivalent to Context tab); register in `SkillDetail/constants.ts` TABS + VALID_TAB_KEYS. | AC-15, AC-18 | Client / component | `client/src/app/skills/[id]/_components/SkillDetail/_components/ContextTab/**`, `client/src/app/skills/[id]/_components/SkillDetail/constants.ts` | `frontend-architecture` → `react-best-practices` | **G4** (after T7) | ContextTab (skill) tests (RTL); e2e project-context (AC-15) |
| T11 | Trace UI: render `spec_blocks` as per-block PromptBlocks under "Project context — attached specs (untrusted)" (mirror `skill_blocks`, `TraceBody.tsx:76-96`); add i18n label; update ALL trace test mocks with the new field. | AC-24 | Client / component | `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx`, `client/messages/en/*.json`, mocks in `RunTraceDrawer.test.tsx`, `RunHistory.test.tsx`, `client/test/contracts.test.ts` | `frontend-architecture` → `react-best-practices` → `react-testing-library` | **G4** (after T7) | RunTraceDrawer tests (RTL) |

## Implementation sequence
1. **G1 dispatches simultaneously** — T1 (contracts), T2 (schema+migration), T3 (config), T4 (reviewer-core guard). Independent files, all foundational. **Converge** after all four land (typecheck green).
2. Then **two package-parallel tracks run simultaneously**:
   - **Server track (G2):** T5 (context module + container) first; **T6 (run-executor injection) after T5** (T6 consumes the context repository). T5 depends on G1 (T1 contracts, T2 schema, T3 config); T6 additionally on T4.
   - **Client track:** **T7 (hooks) first** (depends on G1 T1 contracts), then **G4 dispatches simultaneously** — T8, T9, T10, T11 (disjoint file sets, all depend on T7).
3. The server track (G2) and the client track (T7→G4) have no shared files after G1 — dispatch as concurrent implementers in separate worktrees. **Converge** for final typecheck + tests + the manual AC-25/AC-9 verification.

## Decided notes & deferred follow-ups
All open questions are resolved; no decision blocks execution. Resolved decisions, folded into the plan above:
- **Any-depth matching (AC-1):** full tree walk per request, pruning ignored dirs only — **no** top-level-roots shortcut. Realized in T5's `walk.ts` as "walk the tree, skip ignored dirs, collect `.md` only under a matched root segment." *Decided — kept as planned.*
- **Guarded read size cap:** **400 KB, reusing the existing `MAX_FILE_SIZE` constant/value** (`repo-intel/constants.ts`); files above it are skipped and recorded. Distinct from the intentionally-uncapped token budget (a byte cap protects the *server read*, not the prompt). Applied in T5 (preview read + attach validation) and T6 (run-time read). *Decided — kept as planned.*
- **Preview endpoint:** stays `POST /repos/:repoId/context/preview { path }` (repo-relative path with `/` needs no URL encoding). *Decided — kept as planned.*
- **AC-25:** manual verification only (live-LLM behavior); no automated task — see DoD. *Decided — kept as planned.*
- **DEFERRED — version-snapshot fidelity (out of scope this lesson):** `agent_versions.config_json` (`knowledge.ts:352-`) snapshots ordered skill ids but will **not** snapshot attached context **paths** in this lesson. Accepted consequence: replaying an old agent version injects *current* attachments, not the version's. Recorded as a future follow-up — **no task added, do not implement here.**

## Known gotchas (from INSIGHTS)
- Shared contracts live in BOTH `server/src/vendor/shared/` and `client/src/vendor/shared/` and must be edited **in sync**; apply only the **targeted** edit to the client copy — do not overwrite it (client copy legitimately diverges). — `server/INSIGHTS.md:88`, `client/INSIGHTS.md:28`.
- Adding a field to a shared **trace** contract requires updating **every** client test mock — `RunTraceDrawer.test.tsx`, `RunHistory.test.tsx`, `contracts.test.ts` — even as `null`. — `client/INSIGHTS.md:24,86`.
- `fastify-type-provider-zod`: a response-schema mismatch throws **500, not 422** — validate both request and response shapes. — `server/INSIGHTS.md:63`.
- `drizzle-kit generate` must run before `db:migrate` or the migration is empty; it only turns **interactive** when a table gains *and* drops columns in one change — adding brand-new tables (T2) is non-interactive. — `server/INSIGHTS.md:64,69`.
- The existing `readClone` (`repo-intel/service.ts:826-828`) has **NO path-traversal guard** — do NOT use it. Use the guarded pattern: `resolve(root, rel)` must stay under `resolve(root)` (== root or startsWith `root + sep`), reject absolute/`..`, plus the 400 KB `MAX_FILE_SIZE` read cap — exactly `conventions/service.ts:194-200`. — `server/INSIGHTS.md:54-57`.
- Every context query must be **workspace-scoped** (IDOR-safe) via the `RepoRepository.getById(ws,id)` pattern before touching the clone. — `server/INSIGHTS.md:56`, `server/CLAUDE.md` tenancy rule.
- `INJECTION_GUARD` is appended to every agent prompt automatically and already enumerates untrusted sources — T4 **adds** project-context/attached-specs to that enumeration; no other guard plumbing needed. `specs` is already threaded end-to-end (`run.ts:140`, injected per-chunk at `run.ts:179`). — `reviewer-core/INSIGHTS.md:19-21`.
- Prompt user-section order is fixed by `assemblePrompt`: `## Project context` renders after repo skeleton, before callers/diff — do not reorder. — `reviewer-core/INSIGHTS.md:21`, `prompt.ts:126`.
- `@testing-library/user-event` is **NOT installed** — client tests use `fireEvent` from `@testing-library/react`. — `client/INSIGHTS.md:13,39`.
- The vendored `<Markdown>` primitive only inline-styles `p/strong/code/a`; headings/lists render flat unless styled via `.dd-md …` in `app/globals.css` (already done) — reuse the primitive (it sets `className="dd-md"`) for the read-only preview rather than a `Textarea` (which has no `readOnly` prop). — `client/INSIGHTS.md:41,48`.
- Do not alias intra-feature co-location imports (`../constants`), and never reach a route's `_components/**` from shared `components/**`; a vitest guard (`src/test/architecture.test.ts`) fails on `../lib|components|messages` imports — use `@/lib` etc. Nav entry in `vendor/ui/nav.ts` is an allowed exception to the vendored-dir rule. — `client/INSIGHTS.md:11,25,31,44`.
- New tab wiring is data-driven: one entry in the tab `TABS` array + the `?tab=` `VALID_TABS`/`VALID_TAB_KEYS` list — no routing change. — `client/INSIGHTS.md:21`; `AgentEditor/constants.ts:11`, `SkillDetail/constants.ts`.

## Risks / open questions
None remaining — all prior open questions are resolved and folded into **Decided notes & deferred follow-ups** above. The only residual is the consciously **deferred** version-snapshot fidelity item (out of scope this lesson).

## Definition of Done
- Every AC-1…AC-30 is covered by a task or explicitly assigned to manual verification (AC-9, AC-25, plus manual performance/a11y non-functionals).
- `pnpm typecheck` passes in `server`, `client`, `reviewer-core`; server unit + integration and client RTL tests written and passing; e2e `project-context` flow covers AC-6/AC-10/AC-15.
- Contracts synced in both `vendor/shared` copies; all trace test mocks updated with `spec_blocks`.
- Zero new LLM calls (AC-22); no-attach path leaves the prompt byte-identical (AC-21).
- Non-goals NG1–NG6 respected; Do-Not-Touch untouched (`vendor/ui`, `vendor/shared` sync-only, pre-scaffolded `db/schema/context.ts` tables, `.env`).
