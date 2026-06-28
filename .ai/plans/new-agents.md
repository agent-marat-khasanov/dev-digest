# Development Plan: new-agents

## Context / Problem

The repo currently ships three Claude Code custom sub-agents under `.ai/agents/` (canonical files
exposed to Claude Code via the `.claude/agents -> ../.ai/agents` symlink): `researcher`, `planner`,
`implementer`. They cover a **research → plan → implement** pipeline but leave the *quality gates*
(testing, architectural review, requirement verification) and *documentation* steps unstaffed.

This plan adds **four new sub-agent definition files** to round out the pipeline:

1. `test-writer` — authors Vitest tests for UI and backend.
2. `architecture-reviewer` — read-only architectural (layer/dependency-rule) review.
3. `plan-verifier` — read-only requirement-coverage / traceability check of a plan vs the code.
4. `doc-writer` — produces docs (reference, ADRs, feature docs) with Mermaid diagrams.

These are **documentation/config artifacts** (Markdown with YAML frontmatter), **not** application
code in `server/` / `client/` / `reviewer-core/`. So each task is "author file X with sections Y,
matching existing-agent conventions." The Tasks table's *Required skills* column records the **runtime
skill each authored agent routes to** (via the `Skill` tool) — not skills used to write the Markdown.

Intended outcome: four well-formed agent files plus an updated `.ai/agents/README.md` index, all
mirroring the conventions of the three existing agents and the rules in `.ai/skills/INSIGHTS.md`.

## Affected modules & layers

- **`.ai/agents/`** — four new Markdown agent files + an update to `README.md` (the index). This is
  the only directory written.
- **No** `server/` / `client/` / `reviewer-core/` / `e2e/` / `vendor/shared` code changes. No onion
  layers and no RSC boundary are touched. The agent *bodies* describe those layers/boundaries (so the
  agents can do their jobs at runtime), but no application code is created or moved.
- Discovery path is unchanged: existing `.claude/agents -> ../.ai/agents` symlink (verified present)
  surfaces the new files to Claude Code automatically.

## Data model changes

None. No tables, indexes, or migrations. (Note: these are **not** the DB-backed reviewer agents in
`server/src/db/schema/agents.ts` — a different concept; do not conflate or touch that schema.)

## API contracts

None. No Zod contracts in `vendor/shared`, no endpoints. The frontmatter "contract" each file must
satisfy is the in-repo agent-file convention only (see Known gotchas).

## Frontmatter convention (apply to every agent file)

Mirror the three existing agents exactly. Fields **actually used in this repo**:

- `name` — kebab-case, matches the filename stem.
- `description` — directive, written so the orchestrator can route to it. **Quote-wrap if it contains
  a colon** (YAML requirement — see `.ai/skills/INSIGHTS.md`).
- `tools` — comma-separated allowlist. Omitting `Edit`/`Write` yields a read-only agent; `Bash` is
  dual-use (can still write), so read-only intent must also be enforced in the prompt body.
- `model` — alias only: `sonnet` or `opus`.
- `color` — optional.
- `isolation` — optional; `worktree` for agents that write files in parallel.

Do **NOT** add `skills:` or `permissionMode:` frontmatter — this repo does not use them; skills are
invoked at runtime via the `Skill` tool (see `.ai/skills/INSIGHTS.md`).

## Tasks

| # | Task | Module/Layer | Files (paths) | Required skills (in order) — *runtime skill the authored agent routes to* | Parallel group | Tests |
|---|------|--------------|---------------|---------------------------------------------------------------------------|----------------|-------|
| 1 | Author `test-writer` agent (frontmatter + body) | `.ai/agents/` (config) | `/home/mkhasanov/Study/dev-digest/.ai/agents/test-writer.md` | Agent routes UI tests via `react-testing-library` (first); backend has **no** testing skill — embed conventions + cite `TESTING.md`, `server/INSIGHTS.md`, `server/test/helpers/pg.ts` | A | none (config file; no automated tests) |
| 2 | Author `architecture-reviewer` agent (frontmatter + body) | `.ai/agents/` (config) | `/home/mkhasanov/Study/dev-digest/.ai/agents/architecture-reviewer.md` | Agent routes via `onion-architecture` (backend) / `frontend-architecture` (client), first; READ-ONLY (no Edit/Write) | A | none |
| 3 | Author `plan-verifier` agent (frontmatter + body) | `.ai/agents/` (config) | `/home/mkhasanov/Study/dev-digest/.ai/agents/plan-verifier.md` | READ-ONLY; routes via `onion-architecture` / `frontend-architecture` only when a placement judgment is needed (coverage-focused, not quality-focused) | A | none |
| 4 | Author `doc-writer` agent (frontmatter + body) | `.ai/agents/` (config) | `/home/mkhasanov/Study/dev-digest/.ai/agents/doc-writer.md` | Agent routes via `mermaid-diagram` when drawing diagrams | A | none |
| 5 | Update agents index: add the four new rows + per-agent blurbs + Sources | `.ai/agents/` (config) | `/home/mkhasanov/Study/dev-digest/.ai/agents/README.md` | n/a (index doc) | B | none |

**Parallelism note:** Tasks 1–4 each create a distinct new file with no overlap, so group **A** can be
dispatched to four concurrent implementers. Task 5 (group **B**) edits the shared `README.md` and must
run **after** 1–4 land (it describes all four), so it is sequential to group A and must not run
concurrently with any task that also touches `README.md`.

### Body outline per agent

**1) `test-writer.md`** — `model: sonnet`; `tools: Read, Edit, Write, Grep, Glob, Bash, Skill`;
`isolation: worktree`. Body sections:
- Role: writes Vitest tests for UI and backend; one scoped test task at a time.
- **UI testing**: MUST invoke `react-testing-library` skill **first**. RTL query priority
  (`getByRole` → … → `getByTestId` last); `userEvent.setup()`; co-located `*.test.tsx`; render wrapped
  in `QueryClientProvider` + `NextIntlClientProvider` — point to the reference test
  `client/src/app/agents/_components/AgentCard/AgentCard.test.tsx`.
- **Backend testing**: NO backend-testing skill exists — embed conventions inline and cite
  `TESTING.md`, `server/INSIGHTS.md`, `server/test/helpers/pg.ts`. Unit = `*.test.ts` (vitest node);
  integration = `*.it.test.ts` via testcontainers (`startPg()` / `dockerAvailable()`, `describe.skip`
  when Docker absent); Fastify via `.inject()`; close the app in teardown; `reviewer-core` stays pure
  with a mocked LLM.
- **Forbid (anti-patterns)**: over-mocking — mock ONLY the outside world (LLM, GitHub, git, network),
  never the code under test; asserting on mocks (`toHaveBeenCalledWith` as the assertion); snapshot
  spam; testing the framework; brittle CSS selectors.
- **What to test**: map each requirement/acceptance criterion to a behavior test (happy + one edge);
  use-case coverage over line coverage; assertions reflect the spec, not current output; a new test
  must be able to fail.
- **DoD**: run the module's tests green; final report = files changed, skills invoked, tests run, and a
  **"Candidate insights"** list. Do **NOT** edit `INSIGHTS.md` (worktree/parallel-conflict rule).

**2) `architecture-reviewer.md`** — `model: opus`; `tools: Read, Grep, Glob, Bash, Skill`
(READ-ONLY — no Edit/Write; reinforce read-only in the body since Bash is dual-use). Body sections:
- Role: architectural review only (layering + dependency rule), read-only.
- MUST invoke `onion-architecture` (backend) / `frontend-architecture` (client) **first**.
- **Embed the backend layer map** (verified paths): domain/ports = `server/src/vendor/shared`
  (Zod contracts + adapter interfaces, e.g. `adapters.ts`); application = `modules/<m>/service.ts`;
  infrastructure = `modules/<m>/repository.ts` + `adapters/` + `db/`; presentation =
  `modules/<m>/routes.ts`; composition root = `server/src/platform/container.ts`. Dependency rule:
  inward-only.
- **Detect**: framework types (`FastifyRequest`, Drizzle `db`) in domain/application; a service
  importing a route; domain importing adapters; business logic in `routes.ts`; concrete adapter
  construction inside services (bypassing container/ports); cross-module cycles; skip/back calls.
- **Out of scope (do NOT flag)**: naming, formatting, comments, performance, missing tests.
- **Method**: per file → list imports → classify source/target layer → flag wrong-direction; cite
  `file:line`; use project severity `CRITICAL` / `WARNING` / `SUGGESTION`; verdict
  `request_changes` / `comment` / `approve`; findings discipline (distinct findings only, zero is a
  valid result). Output a Markdown report. Be honest when unsure.

**3) `plan-verifier.md`** — `model: opus`; `tools: Read, Grep, Glob, Bash, Skill` (READ-ONLY).
Body sections:
- Role: given a plan (`.ai/plans/<feature>.md`) **+ the code already written**, verify EVERY
  requirement/task is actually implemented. Focus = **requirement coverage & traceability**, NOT code
  quality / best practices.
- **Output: traceability table** — each requirement → status `MET` | `PARTIAL` | `MISSING` → evidence
  (`file:line`, test name).
- **Evidence-gated**: never `MET` without a concrete citation; if not found → `MISSING` and state where
  you searched. `PARTIAL` = impl exists but no test / happy-path only.
- **Drift**: flag orphan code not in the plan, and plan items with no code.
- **Verdict**: `approve` only if all `MET`; else `request_changes` with a blocking-gaps list.
  Anti-rubber-stamp posture.

**4) `doc-writer.md`** — `model: sonnet`; `tools: Read, Edit, Write, Grep, Glob, Bash, Skill`.
Body sections:
- Three modes: (a) document implemented functionality from code; (b) convert an implementation plan
  into docs; (c) turn given inputs into structured docs **with Mermaid diagrams** (invoke the
  `mermaid-diagram` skill).
- **Doc-placement convention** (Diataxis + docs-as-code): module-scoped reference → that module's
  `README.md`; system architecture → `docs/architecture.md` (**create if missing** — does not yet
  exist); decisions → `docs/adr/NNNN-title.md` (Nygard template; **create folder if missing**);
  how-to/tutorials → `docs/guides/`; API/config reference → `docs/reference/`; feature docs from a plan
  → `docs/features/<feature>.md`. Diagrams = fenced ` ```mermaid ` blocks (no image files); pick type
  by purpose (flowchart / sequenceDiagram / erDiagram / stateDiagram-v2 / classDiagram). Does **NOT**
  write `INSIGHTS.md`.
- **Honesty**: every API/type/field must appear verbatim in the code read; mark unverified items as
  `> [UNVERIFIED — not found in source]`; cite `file:line`; omit a diagram rather than invent one.
  Scannable Markdown (single H1 title; tables for params; ≤3 heading levels).

**5) `README.md` update** — add a row per new agent to the "Agents at a glance" table (Agent / Model /
Tools / Isolation / Purpose), add a short per-agent blurb section + a "Based on" line, fold the new
research URLs into the existing **Sources** section, and keep the Maintenance note. Preserve the
existing distinction that these are NOT the DB-backed reviewer agents.

## Implementation sequence

1. **Dispatch group A in parallel** — four concurrent implementers, one per agent file (Tasks 1–4).
   They write to four disjoint new paths, so there is zero file overlap.
2. **After all of group A lands, run group B** (Task 5): update `.ai/agents/README.md` to index and
   describe the four new agents and extend Sources. Sequential because it depends on the final
   frontmatter/purpose of all four files.
3. **Validate frontmatter** by hand against the convention: YAML parses, `description` colon-quoting is
   correct, `model` is a bare alias, `tools` is a comma list, no `skills:` / `permissionMode:` keys,
   read-only agents (Tasks 2 & 3) omit `Edit`/`Write`.

## Known gotchas (from INSIGHTS)

All from `.ai/skills/INSIGHTS.md` (repo-meta is the right home for agent-file work):

- **Canonical path + symlink**: real files live in `.ai/agents/<name>.md`; Claude Code discovers them
  via `.claude/agents -> ../.ai/agents` (verified present). Write only to `.ai/agents/`. — `.ai/skills/INSIGHTS.md`
- **No `skills:` / `permissionMode:` frontmatter**: this repo does not use them. Skills are invoked at
  runtime via the `Skill` tool; preloading via frontmatter is explicitly *not* the chosen pattern
  (avoids loading a backend skill for a UI task and vice-versa). — `.ai/skills/INSIGHTS.md`
- **Quote a `description` containing a colon**: YAML requires it (the existing skills hit this with
  `OWASP Top 10:2025`). Several new descriptions will mention statuses like `MET`/`MISSING` or
  `CRITICAL` severities — wrap in quotes if any colon appears. — `.ai/skills/INSIGHTS.md`
- **Read-only is two-part**: omitting `Edit`/`Write` from `tools` makes an agent read-only, BUT `Bash`
  is dual-use (can still write) — so for `architecture-reviewer` and `plan-verifier` also enforce
  read-only in the prompt body, not just the tools list. — `.ai/skills/INSIGHTS.md`
- **Do not edit vendored skill `SKILL.md` files** to make these agents activate skills; activation is
  driven by `description` wording + the `AGENTS.md` routing table. The agent bodies should *instruct
  invoking* skills at runtime, not modify them. — `.ai/skills/INSIGHTS.md`
- **`CLAUDE.md` is a symlink to `AGENTS.md`** — do not "mirror" content into both; they are the same
  file. (Not edited here, but relevant if any task is tempted to touch root docs.) — `.ai/skills/INSIGHTS.md`
- **Don't conflate with DB-backed reviewer agents** (`server/src/db/schema/agents.ts` +
  `docs/agent-prompts/`, which use `provider`/`model`/`systemPrompt`/`outputSchema`). These four are
  Claude Code sub-agents — a different concept. — `.ai/skills/INSIGHTS.md`
- **Lockstep maintenance**: `planner` and `implementer` mirror the same two skill sets; if a new agent
  (e.g. `test-writer`) restates those sets, keep it in lockstep with the others when Skill Routing
  changes — note this in the README Maintenance section. — `.ai/skills/INSIGHTS.md` / `.ai/agents/README.md`

## Best practices & sources (to embed in the agent bodies / README Sources)

Condensed research grounding for each agent; fold the URLs into the README **Sources** section.

- **Sub-agent / skills design (official Anthropic)**:
  - Sub-agents — https://code.claude.com/docs/en/sub-agents
  - Agents (parallel) — https://code.claude.com/docs/en/agents
  - Skills — https://code.claude.com/docs/en/skills
  - Building Effective Agents — https://www.anthropic.com/research/building-effective-agents
  - Equipping agents with Agent Skills — https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- **Testing (`test-writer`)**:
  - Testing Library queries — https://testing-library.com/docs/queries/about/
  - Fastify Testing — https://fastify.dev/docs/latest/Guides/Testing/
  - Kent C. Dodds — Testing Trophy / Testing Implementation Details / How to Know What to Test —
    https://kentcdodds.com
  - "Are Coding Agents Generating Over-Mocked Tests?" — https://arxiv.org/html/2602.00409v1
  - "Rethinking the Value of Agent-Generated Tests" — https://arxiv.org/html/2602.07900v1
- **Architecture review & verification (`architecture-reviewer`, `plan-verifier`)**:
  - CAPRA — https://arxiv.org/html/2606.18976v1
  - Evaluating LLMs for Detecting Architectural Decision Violations — https://arxiv.org/html/2602.07609
  - Guideline-Grounded Evidence Accumulation — https://arxiv.org/pdf/2603.02798
  - IEEE layering-violation detection — https://ieeexplore.ieee.org/document/6978182
- **Docs (`doc-writer`)**:
  - Diataxis — https://diataxis.fr
  - Mermaid — https://mermaid.js.org
  - Nygard ADRs — https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions.html and
    https://adr.github.io
  - DocAgent — https://arxiv.org/html/2504.08725v1
  - Write the Docs — docs-as-code — https://www.writethedocs.org/guide/docs-as-code/
- **Practitioner**: PubNub — Best practices for Claude Code sub-agents —
  https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/

## Risks / open questions

- **`test-writer` skill routing is asymmetric**: a first-class `react-testing-library` skill exists for
  UI, but there is **no** backend-testing skill. The plan handles this by embedding backend conventions
  in the body and citing `TESTING.md` + `server/INSIGHTS.md` + `server/test/helpers/pg.ts` (all
  verified to exist). Confirm this is acceptable rather than introducing a new local skill (out of
  scope here).
- **`doc-writer` target dirs mostly don't exist yet**: only `docs/agent-prompts/` is present;
  `docs/architecture.md`, `docs/adr/`, `docs/guides/`, `docs/reference/`, `docs/features/` are absent.
  The body already says "create if missing," so this is expected, not a blocker — but note `CLAUDE.md`'s
  "Read When" table already references `docs/architecture.md`, implying it was intended to exist.
- **`isolation: worktree` on `test-writer` and `doc-writer`**: both write files and may run in
  parallel, so `worktree` matches the `implementer` precedent. The two read-only agents
  (`architecture-reviewer`, `plan-verifier`) intentionally omit it. Confirm no doc-writer task needs to
  see another worktree's just-written code in the same run (if it must document brand-new code, sequence
  it after that code lands).
- **README Sources growth**: the index already has Official/Practitioner sub-sections. Decide whether
  to add per-agent source groupings or fold all new URLs into the existing lists (plan assumes the
  latter for minimal churn).

## Definition of Done

- Four new files exist: `.ai/agents/test-writer.md`, `.ai/agents/architecture-reviewer.md`,
  `.ai/agents/plan-verifier.md`, `.ai/agents/doc-writer.md` — each with valid YAML frontmatter using
  only the repo's fields (`name`, `description`, `tools`, `model`, optional `color`, optional
  `isolation`) and **no** `skills:` / `permissionMode:` keys.
- `description` values with a colon are quote-wrapped; `model` is a bare alias (`sonnet`/`opus`);
  `tools` is a comma list; read-only agents (`architecture-reviewer`, `plan-verifier`) omit
  `Edit`/`Write` and reinforce read-only in the body.
- Each body matches its outline above (role, mandatory skill routing, embedded conventions/layer maps,
  forbidden behaviors, method, output format, DoD/report shape).
- `.ai/agents/README.md` lists and describes all seven agents and extends Sources.
- Scope respected: only `.ai/agents/` files touched; **no** `server/`/`client/`/`reviewer-core/`/`e2e/`
  code, no `vendor/`, no `server/src/db/schema/`, no `.env`, no edits to vendored `SKILL.md` or to
  `AGENTS.md`/`CLAUDE.md`.
- Markdown lints/reads cleanly and mirrors the tone and structure of the three existing agent files.
</content>
</invoke>
