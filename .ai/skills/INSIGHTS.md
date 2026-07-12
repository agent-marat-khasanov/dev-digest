# Skills & Project-Docs INSIGHTS

Repo-meta knowledge about how skills and the AI entry-point docs work. Not tied to a code
module (server/client/reviewer-core/e2e) — lives here because it concerns `.ai/skills/` and the
root `AGENTS.md`/`CLAUDE.md`.

## What Works

- Directive skill descriptions activate far more reliably than passive ones. Lead with `<Domain>
  expert`, then `ALWAYS invoke this skill when <explicit trigger list>`, then a negative constraint
  `Do not <bypass action> directly — consult this skill first`. Keep any existing `Does NOT cover X —
  use <other-skill>` sentence to prevent overlapping-trigger confusion between sibling skills
  (frontend-architecture vs react-best-practices; onion vs fastify/drizzle).
- A `## Skill Routing` table in `AGENTS.md` (domain/file-path → skill, "MUST invoke first") is the
  only activation lever for vendored skills whose `SKILL.md` we don't edit on disk.
- Multi-wave `implementer` orchestration that integrates cleanly: partition each wave so parallel
  agents touch DISJOINT files, then integrate a wave into the feature branch BEFORE dispatching the
  next (so the next wave's deps exist). `implementer` worktrees branch from the repo BASE commit (e.g.
  `main`), NOT the orchestrator's in-flight feature-branch HEAD, and they do NOT auto-commit — so a
  later wave's worktree lacks earlier waves' work. Integrate by **copying only the files that agent
  owns** from its `worktreePath` into the main tree (skip any shared-contract edits it re-applied to
  satisfy its stale base — those already exist on the branch), then commit with EXPLICIT paths. A
  good `implementer` will itself run `git merge <feature-branch> --no-commit` to pull deps into scope.
- After an `implementer` returns, VERIFY its deliverable files exist (`ls`/`grep`) before integrating
  — its final report can be trusted only after this check (see What Doesn't Work).

## What Doesn't Work

- Do NOT assume an `implementer` agent wrote code just because its final report reads like success.
  In this session a Group-C implementer returned a polished onion-architecture LAYERING PLAN but had
  written ZERO files (`ls server/src/modules/intent/` → "No such file or directory"); the report was
  truncated at the analysis stage. Always `ls`/`grep` for the concrete deliverables before integrating
  or committing. The re-dispatch with an explicit "ACTUALLY WRITE AND SAVE every file, then run `ls`
  to verify" + a "report the verification command outputs" clause produced the real implementation.
- Do NOT `cp -r <src_dir> <dest_dir>` to integrate a worktree's new module when `<dest_dir>` may
  already exist — `cp` then nests it (`modules/intent/intent/...`), and the extra path level silently
  breaks every relative import (`../../db/...` resolves one level too shallow → TS2307 storm). After
  any directory copy, `find <dest> -type f` to confirm the structure before typechecking.
- Do NOT "mirror" a section into both `AGENTS.md` and `CLAUDE.md` — **`CLAUDE.md` is a symlink to
  `AGENTS.md`** (`ls -la CLAUDE.md` → `CLAUDE.md -> AGENTS.md`). They are the same file; editing one
  edits both. A second mirror edit duplicates the section. `git diff` shows only `AGENTS.md`.
- Do NOT edit vendored skill `SKILL.md` files in place to improve their descriptions. The 8 skills
  in `skills-lock.json` are pinned from GitHub with a `computedHash`; local edits diverge from the
  lock and get clobbered on re-sync. Drive their activation via the `AGENTS.md` routing table
  instead, or change the wording upstream.
- Do NOT apply the aggressive `ALWAYS invoke` template to manual/utility skills. `pr-self-review` is
  deliberately `"Do NOT auto-load... manual only"`; `engineering-insights` is a wrap-up trigger;
  `mermaid-diagram` is user-intent. Making these directive causes over-firing / breaks intended UX.
- Do NOT expect to run `pnpm install` / `pnpm typecheck` / `vitest` from inside the agent sandbox:
  this Linux/WSL shell has **no Node toolchain** — `node`/`npm`/`pnpm` are absent even in a login
  shell, and there is no `/mnt/c` interop to a Windows node. Write the code + tests, but hand
  build/typecheck/test verification to the user (they run pnpm from the Windows side). State this
  plainly instead of claiming a change is verified.
- The `CLAUDE.md → AGENTS.md` symlink also blocks the Write/Edit tools directly: editing `CLAUDE.md`
  fails with "Refusing to write through symlink". `readlink -f CLAUDE.md` and edit the real target
  (`AGENTS.md`). (`.ai/rules/architecture-map.md` is a real file, not a symlink.)
- Do NOT let a downstream agent answer a spec's `[NEEDS CLARIFICATION: …]` entries. They are
  `spec-creator`'s to fold back into the spec (it Edits the file in place, same Spec ID).
  `implementation-planner` relays them and stops — an answer invented at plan time never makes it back
  into the spec, so the spec and the code silently diverge and `plan-verifier` validates against a
  stale document.
- Do NOT dispatch or resume a **write-capable** subagent while the session is in plan mode — the
  harness holds the subagent read-only too. A resumed `spec-creator` looped three times (~90–110k
  tokens each) re-planning its edits and asking "confirm to exit plan mode" instead of writing.
  Worse, plan mode can engage MID-RUN: some edits land, the rest don't, leaving the file in a mixed
  state that drifts from the agent's report. Recovery: Read the target file to establish actual
  on-disk state before re-dispatching, and only resume the writer after plan mode is off.
- Renaming a subagent is a **repo-wide rename, not a file rename**: agents reference each other by
  name inside their *prompt bodies*, and so do `.ai/rules/*.md`. Renaming `planner` →
  `implementation-planner` left dangling refs in `spec-creator.md`, `implementer.md` (which also spoke
  of a "Development Plan" that no longer exists), `.ai/rules/skill-routing.md`, and
  `.ai/rules/read-insights-first.md`. Always `grep -rn "\b<old-name>\b" .ai/` after the `git mv`.
  Historical artifacts (`.ai/plans/*.md`, this file's Session Notes) are records of the past — leave
  the old name there.

## Codebase Patterns

- Project skill definitions live in `.ai/skills/<name>/SKILL.md` (NOT `.claude/skills/`). The 4
  code-module `INSIGHTS.md` files cover code knowledge only; this file covers skills/docs meta.
- Skill activation is governed solely by the `description:` frontmatter field — there is no separate
  `trigger`/`when`/`auto-activate` field, and a `keywords` field has no effect. The `description:`
  often contains a colon (e.g. `OWASP Top 10:2025`), so it MUST be quote-wrapped to stay valid YAML.
- `engineering-insights` skill only targets the 4 code modules. Repo-meta work (skills, root docs)
  has no module home — record it here instead of forcing it into an unrelated module file.
- Custom **Claude Code subagents** (markdown with `name`/`description`/`tools`/`model` frontmatter,
  discovered from `.claude/agents/`) follow the same `.ai/`-canonical + symlink pattern as
  skills/rules: real file at `.ai/agents/<name>.md`, with `.claude/agents -> ../.ai/agents`. These
  are NOT the DevDigest DB-backed reviewer agents (`server/src/db/schema/agents.ts` +
  `docs/agent-prompts/`, which use `provider`/`model`/`systemPrompt`/`outputSchema` and emit findings
  JSON). Different concept — don't conflate.
- Subagent frontmatter restricts capability two ways: `model: sonnet` (alias) pins the tier, and
  `tools:` is an allowlist — omitting Edit/Write/NotebookEdit yields a read-only agent. Bash is
  dual-use (can still write), so enforce read-only via the prompt body, not the tools list.
- **WHAT/HOW split across the planning agents**: `spec-creator` owns the WHAT (specs at
  `<module>/specs/SPEC-NN-<slug>.md`, root `specs/` if cross-module; EARS criteria with `AC-n` IDs);
  `implementation-planner` owns the HOW (`.ai/plans/<feature>.md`). The **`AC-n` ID is the traceability
  spine of the whole pipeline**: spec-creator mints it → the plan's `Covers` column cites it →
  `plan-verifier` traces code back to it. An agent in this chain must NEVER invent a parallel
  requirement notation (e.g. its own `R1..Rn`) — that silently severs the chain and plan-verifier has
  nothing to check coverage against.
- **Clarification gate (user-mandated, codified in `spec-creator.md` → Report format):** when a
  spec ships with a non-empty `[NEEDS CLARIFICATION]`, the orchestrator must IMMEDIATELY walk the
  user through the items **one question at a time** (AskUserQuestion with options + a
  recommendation each), then re-dispatch spec-creator to fold the answers in; `implementation-planner`
  must not be dispatched while any item is open. Do not bundle several decisions into one
  AskUserQuestion call and do not relay the questions as passive report text — the user explicitly
  rejected both.
- `implementation-planner` runs **two gates before it is allowed to Write a plan**: Gate A (review the
  spec's `AC-n` for gaps/contradictions/ambiguity/untestability/buildability + form recommendations)
  and Gate B (return questions + recommendations + the multi-agent-vs-single-agent question, then
  STOP). The chosen execution mode **changes the plan's shape**, it is not a label: multi-agent emits
  a `Parallel group` column with non-overlapping files per group; single-agent emits a strictly
  ordered step list with no groups, each step ending green. Ask it every run.

## Tool & Library Notes

- `skills-lock.json` schema: `{ version, skills: { <name>: { source, sourceType, skillPath,
  computedHash } } }`. `source` is a `owner/repo` GitHub slug; `skillPath` is the path to `SKILL.md`
  within that repo. Local-only skills (project-specific) are absent from this lock.

## Tool & Library Notes

- **Claude Code subagent frontmatter** (`.ai/agents/*.md`) supports more than name/description/tools/
  model/color: also **`effort`** (`low`|`medium`|`high`|`xhigh`|`max` — the thinking-budget lever; no
  separate extended-thinking field), `maxTurns`, **`skills`** (preload skills into context at startup),
  `disallowedTools`, `permissionMode`, per-subagent `hooks` (incl. a `SubagentStop` event), `isolation`,
  `memory`, `background`. `model` accepts an alias, a full id, or `inherit` (the default).
- **`@path` imports do NOT work in subagent files** — only in `CLAUDE.md`/`AGENTS.md`. To share content
  across agents, have the agent **Read** a shared file at runtime (we use `.ai/rules/*.md` pointers) or
  use the `skills:` preload field. Don't try to `@`-import a rules file into an agent — it won't expand.
- **PreToolUse hooks fire for subagent tool calls too** (the stdin JSON carries `agent_id`/`agent_type`
  when inside a subagent; absent in the main session). So a `.claude/settings.json` PreToolUse hook on
  `"Edit|Write"` nudges implementers, not just the main loop. A hook injects non-blocking context via
  stdout `{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"…"}}` (exit 0), or
  blocks via `"permissionDecision":"deny"` / exit code 2. There is no way to scope a top-level hook to
  skip subagents — the script must inspect `agent_id` itself. `jq` is NOT installed here; write hook
  scripts in `python3` (read `json.load(sys.stdin)`), reference via `$CLAUDE_PROJECT_DIR`.
- **8 subagent colors, but we have 10 agents** (valid: red/blue/green/yellow/purple/orange/pink/cyan) —
  full uniqueness is impossible. Place the unavoidable reuses on agents that don't run in parallel
  (we paired planner+brainstorm=yellow, doc-writer+investigator=blue). Color is cosmetic only.
- **Claude Code hot-reloads the agent registry mid-session.** A `git mv .ai/agents/planner.md
  .ai/agents/implementation-planner.md` (+ the `name:` field) made the harness drop the `planner`
  agent type and expose `implementation-planner` in the *same* session — no restart, no re-symlink
  (`.claude/agents -> ../.ai/agents` covers it). Caveat: after a `git mv`, the Write tool still
  refuses the new path with "File has not been read yet" — its file-state tracking is keyed by path,
  not inode, so Read the renamed path once before Writing it.
- …but the hot-reload is **delayed, not instant**: dispatching a freshly Written agent file right
  away fails with "Agent type '<name>' not found" (observed with `spec-creator`); the registry
  caught up a few turns later (harness announced the new agent types). Workarounds: wait/retry the
  dispatch later in the session, or smoke-test via a nested headless run (`claude -p "dispatch
  <agent> …" --permission-mode acceptEdits`) — a fresh session sees the new agent immediately, but
  it is slow (minutes) and burns tokens.

## Recurring Errors & Fixes

## Session Notes

### 2026-07-12 — SPEC-01 Project Context: full spec→clarify→approve→plan chain
- First real run of the SDD front half: `spec-creator` authored `specs/SPEC-01-project-context-2026-07-12.md`
  (30 EARS ACs) from 4 design mockups + Ukrainian requirements; 6 `[NEEDS CLARIFICATION]` items were
  closed with the user stepwise (no cap on injected tokens — consciously discarded; exact
  case-sensitive folder-segment match at any depth; `ContextDoc` replaces pre-scaffolded
  `SpecFile`/`IndexStatus`; on-demand preview; structured `spec_blocks` in trace; on-demand uncached
  discovery), folded back by resuming the SAME spec-creator via SendMessage, DoR passed → `approved`.
- `implementation-planner` then produced `.ai/plans/project-context.md`: 11 tasks covering all 30 ACs
  (G1 contracts/schema/config/guard in parallel → server track ‖ client track), its 5 open questions
  also closed stepwise with the user (400 KB read cap reusing `MAX_FILE_SIZE`; AC-25 manual; R1
  version-snapshot deferred; POST preview endpoint) and folded back via resume. Confirmed
  reviewer-core needs only the `INJECTION_GUARD` text change — `ReviewInput.specs` is already
  threaded through both single-pass and map-reduce paths.
- Mockups showed more than the requirements text (edit mode, coverage badge, index stats):
  resolving the scope conflict with the user BEFORE dispatching spec-creator (2 questions) kept the
  out-of-scope items as explicit Non-goals instead of spec churn.

### 2026-07-11 — `/sdd` → `/impl`: pipeline trimmed to the execution half + model downgrades
- `/sdd` was replaced by **`/impl`** (`.ai/skills/impl/SKILL.md`) the same day: `spec-creator` and
  `implementation-planner` are run MANUALLY outside the command (user decision); `/impl` takes a
  ready plan path and executes implement → verify round → user-gated fix loop → final verify →
  doc-writer. Do not resurrect the spec/plan phases inside the command.
- **test-writer is disabled in the `/impl` pipeline** (token economy) — the command must not
  dispatch it; ACs whose `Verify:` tag needs tests are reported as "tests pending (manual)". The
  agent file stays for manual use.
- Token-economy model downgrades: `architecture-reviewer` and `plan-verifier` opus → **sonnet**
  (effort stays high). Opus remains only on judgment-dense authors: `spec-creator`,
  `implementation-planner`, `brainstorm`. Keep the README table in sync when re-tiering.

### 2026-07-11 — `/sdd` command: pipeline-runner as a manual-only skill
- The whole SDD pipeline is now one command: `.ai/skills/sdd/SKILL.md` — a MANUAL-ONLY skill (same
  activation pattern as `pr-self-review`) whose body is an orchestration protocol for the MAIN
  session (subagents can't spawn subagents, so the orchestrator must be the main loop; a skill is
  the right vehicle for "orchestrator behavior on demand").
- Its user gates (by explicit user decision): spec approval, planner Gate B answers, and the
  post-verification **findings gate** — NOTHING from architecture-reviewer/plan-verifier is fixed
  automatically; the user multi-selects findings, targeted implementers fix, and only the
  reviewer(s) whose findings were addressed re-run. doc-writer always runs at the end.
- Unlike the agent registry (delayed hot-reload), a freshly Written skill was registered
  IMMEDIATELY in the same session — skills and agents reload on different paths.

### 2026-07-11 — SDD workflow audit → verify ordering, planner token diet, codified phase order
- **Run `plan-verifier` TWICE**: pass 1 right after implementer integration (parallel with
  `architecture-reviewer` — both read-only), so MISSING/PARTIAL ACs surface *before* test-writer
  invests in tests; final pass after fixes + tests for the approve verdict (~41k tokens/pass per
  METRICS — two passes are worth it).
- `architecture-reviewer` does NOT hunt functional bugs (structure only, by design). Project
  decision: bugs are caught by tests — every AC maps to a behavior test (test-writer now reads the
  spec's `Verify:` tags: unit/integration in scope; e2e/manual reported as not-covered-here). No
  separate bug-review agent — don't propose one again. E2E flow ownership deliberately unassigned.
- `implementation-planner` token diet: the big cost was the **Gate B double dispatch** (fresh
  re-dispatch re-reads everything → resume the SAME agent via SendMessage instead; note added to its
  prompt) + blanket doc reading (now: affected modules only, and start tracing from the spec's
  `Inputs (provenance)` citations instead of from scratch) + liberal Skill loads (now: only when a
  placement decision is genuinely contested). Its prompt never ran tests — the user's impression was
  wrong, but an explicit "never run tests/typecheck/builds" guard was added anyway.
- The SDD phase order is now codified in `.ai/agents/README.md` "How they fit together" (spec →
  gates+SendMessage resume → implementers per wave → verify pass 1 ‖ arch-review → fix → tests →
  verify final → docs/insights/metrics) — keep it in sync when the pipeline changes.

### 2026-07-11 — spec-creator: skill routing + spec-quality gates
- Skill analysis for a WHAT-level agent: route `security` (derives concrete `IF…THEN…SHALL` for
  Untrusted inputs / security NFRs), `mermaid-diagram` (Flows diagrams), and `onion-architecture`/
  `frontend-architecture` **only as boundary-legality checks** — implementation/test skills
  (incl. `zod`) explicitly excluded because spec contracts are field tables, not code.
- Spec-quality gates baked in: unhappy-path pairing (every `WHEN` must consider its `IF…THEN`
  counterpart), `Verify: unit|integration|e2e|manual` tag per AC, Definition-of-Ready checklist
  gating `draft→approved`, a review/lint mode (checklist against an existing spec, read-only unless
  told to fix), spec index table in root `specs/README.md`, `## Changelog` line on in-place edits.
  An `## Assumptions` section was proposed and REJECTED by the user — don't re-add it.
- Subagents cannot spawn subagents, so an agent that needs research (spec-creator) must NOT be told
  to "use researcher" — encode a **Research needs** report block instead (numbered self-contained
  questions tagged `researcher`/`investigator`); the orchestrator fans them out in parallel and
  re-dispatches the agent with findings, which it cites in Inputs (provenance). Also added:
  scoped INSIGHTS reading (affected modules only), Traceability section (AC-n spine, never
  renumber — dropped ACs keep their ID with a `(dropped: <reason>)` note), NFRs as EARS with
  measurable thresholds, and a final self-check step (DoR + abstraction scan) before reporting.

### 2026-07-11 — Split `planner` into `spec-creator` (WHAT) + `implementation-planner` (HOW)
- `git mv .ai/agents/planner.md → implementation-planner.md`; `name:` → `implementation-planner`.
  The agent no longer produces requirements of any kind: it consumes a `spec-creator` spec and refuses
  to plan without one ("Not your job" section — never authors/rewords/infers acceptance criteria; a
  gap is an open question, never an assumption; a `Status: draft` spec is surfaced before planning).
- Two new gates precede the plan Write: **Gate A** (critical review of the spec's `AC-n` — gaps,
  contradictions, ambiguity, untestable criteria, buildability, Do-Not-Touch/layer-map conflicts) and
  **Gate B** (return questions + recommendations + the **multi-agent vs single-agent** question, then
  STOP). Recommendations are advice, never silently promoted into the Tasks table.
- Plan format re-anchored on `AC-n` (was a self-invented `R1..Rn`): header carries Spec ID + status,
  an "Acceptance criteria (from the spec)" table copies the ACs verbatim, and every task's `Covers`
  column cites the AC IDs it satisfies. Renamed "Development Plan" → "Implementation Plan" throughout
  (incl. `implementer.md`, which reads the plan as its contract).
- The mode answer is structural: multi-agent → `Parallel group` column (non-overlapping files per
  group); single-agent → strictly ordered steps, no groups, each ending green.
- Ask-before-writing paid off here: the first draft invented an `R1..Rn` notation and a generic
  "spec document" input, both of which would have broken the spec→plan→verify chain that
  `spec-creator` had just established. Reading the sibling agent's file first is what caught it.

### 2026-06-22 — Skill activation tuning (directive descriptions + routing table)
- Audited 14 skills against the "Why Claude Code Skills Don't Activate" methodology: 11/14 used the
  weak passive `Use when ...` pattern (~50% activation per that study); only `drizzle-orm-patterns`
  said `Proactively use`.
- Rewrote 5 **local** domain skills to the directive template: `frontend-architecture`,
  `onion-architecture`, `react-best-practices`, `react-testing-library`, `security`.
- Left the 6 **vendored** domain skills (`fastify-best-practices`, `drizzle-orm-patterns`,
  `postgresql-table-design`, `next-best-practices`, `typescript-expert`, `zod`) unedited on disk
  (lock integrity) — covered them via a new `## Skill Routing` table in `AGENTS.md`.
- Left `pr-self-review`, `engineering-insights`, `mermaid-diagram` untouched by design.
- Chosen path is description + AGENTS.md routing, no hook. It is model-mediated, NOT
  code-deterministic. Hard determinism would require a `UserPromptSubmit`/`PreToolUse` hook mapping
  file-path → skill (consciously deferred).

### 2026-06-25 — Added 3 auxiliary read-only agents: brainstorm, investigator, insight-curator
- All read-only (no Edit/Write). `brainstorm` = opus (Best-of-N: ground in code → 3–5 diverse options
  via distinct lenses → rubric with pass/fail gates + position-bias guard → one recommendation +
  uncertainty; tools incl. `Skill`). `investigator` = sonnet, tools **exactly `Read, Grep, Glob,
  Bash`** — deliberately project-only (no web, no Skill) so it stays distinct from `researcher`;
  narrow codebase search + bidirectional dependency tracing, cites file:line, conclusions-not-dumps
  (mirrors the built-in Explore agent). `insight-curator` = sonnet, read-only complement to the
  `engineering-insights` skill — reads module INSIGHTS.md, dedupes (states what's lost before any
  merge), recommends promotions (procedure→skill / decision→docs|ADR / cross-module→spec); it
  RECOMMENDS, never writes.
- `plan-verifier` already existed (from the prior batch) and matched the slide; extended its
  description + body to verify against "a plan OR a spec/requirements document". The slide's
  "допоміжні" set was 4 but only 3 were new.
- Colors are just UI hints and may repeat, but gave insight-curator `pink` to avoid sharing `orange`
  with plan-verifier.

### 2026-06-25 — Added 4 agents: test-writer, architecture-reviewer, plan-verifier, doc-writer
- Planned via the `planner` agent (`.ai/plans/new-agents.md`) with web best-practices gathered by
  parallel `researcher` agents; built the four files in `.ai/agents/`. Models: architecture-reviewer
  & plan-verifier = `opus` (reasoning); test-writer & doc-writer = `sonnet`. Reviewers are read-only
  (no Edit/Write); test-writer & doc-writer have write tools; test-writer uses `isolation: worktree`.
- `test-writer` skill routing is **asymmetric**: UI routes to `react-testing-library`, but there is
  **NO backend-testing skill**, so server Vitest/testcontainers conventions are embedded in its prompt
  (grounded in `TESTING.md`, `server/test/helpers/pg.ts`). If a backend-testing skill is ever added,
  route to it and trim the embedded section.
- `architecture-reviewer` and `plan-verifier` reuse the `docs/agent-prompts` review vocabulary
  (CRITICAL/WARNING/SUGGESTION + verdict + findings discipline + `file:line`) but output a **markdown**
  report (not the DB reviewer-agents' JSON). Architecture-reviewer = structure only (explicit
  out-of-scope list); plan-verifier = requirement coverage only, evidence-gated (no MET without a
  citation), anti-rubber-stamp.
- `doc-writer` owns a new **doc-placement convention** (Diataxis + docs-as-code): module `README.md`,
  `docs/architecture.md`, `docs/adr/` (Nygard), `docs/guides/`, `docs/reference/`, `docs/features/`;
  Mermaid diagrams as fenced blocks; it creates these dirs on first use (only `docs/agent-prompts/`
  exists today). It does NOT write `INSIGHTS.md` (that's `engineering-insights`).

### 2026-06-25 — Planner mirrors implementer skill sets + gains Skill tool
- Planner's skill section now mirrors the implementer's two sets verbatim (Backend incl.
  `reviewer-core`: `onion-architecture` first → fastify/drizzle/postgres/zod/security/typescript;
  UI: `frontend-architecture` first → react/next/RTL/zod/security/typescript), replacing the old
  divergent "When the task will…" table — so the plan's *Required skills* column maps 1:1 to what the
  implementer invokes. Added `Skill` to planner `tools` so it can consult those skills while planning
  (still no `Edit`). Keep the two agents' skill sets in lockstep when either changes.

### 2026-06-25 — Refined implementer self-review + INSIGHTS usage loop
- Implementer self-review is now **code-only** (review just the diff it wrote — correct/in-scope/
  secure); no broad QA/architecture pass. Its DoD: write code + keep the module's **existing tests
  green**; author **new** tests only when the plan task's Tests column explicitly requires.
- INSIGHTS loop split by direction to avoid worktree/parallel conflicts: agents **consume** INSIGHTS
  (read "What Doesn't Work" / "Recurring Errors & Fixes" / "Tool & Library Notes" first); the
  implementer **reports a "Candidate insights" list** in its final message instead of editing any
  `INSIGHTS.md`, and the **main session records them** via engineering-insights once.
- Planner now mines module INSIGHTS into a `## Known gotchas (from INSIGHTS)` plan section (each
  bullet citing its source file) so warnings propagate to implementers through the plan.

### 2026-06-25 — Added `planner` + `implementer` subagents (plan→implement pipeline)
- `.ai/agents/planner.md` (model `opus`, tools `Read,Grep,Glob,Bash,Write`, no Edit) writes a
  structured Development Plan to `.ai/plans/<feature>.md`; `.ai/agents/implementer.md` (model
  `sonnet`, tools `Read,Edit,Write,Grep,Glob,Bash,Skill`, `isolation: worktree`) builds one scoped
  task from that plan. Handoff is the plan file under `.ai/plans/` (created `.ai/plans/.gitkeep`).
- The plan's **Tasks** table carries two bridge columns: `Required skills (in order)` (drives the
  implementer's mandatory skill routing) and `Parallel group` (which tasks can run as concurrent
  implementers without file overlap).
- Implementer enforces the CLAUDE.md Skill Routing as TWO explicit sets — backend: `onion-architecture`
  first then fastify/drizzle/postgres/zod/security/typescript; UI: `frontend-architecture` first then
  react/next/RTL/zod/security/typescript. It needs the `Skill` tool to invoke them at runtime
  (chose runtime invocation over `skills:` frontmatter preload, so a UI task doesn't load the backend
  architecture skill and vice-versa).
- `isolation: worktree` in frontmatter = each parallel implementer gets its own git worktree
  (branched from the default branch, auto-cleaned if unchanged) — the official safe-parallel pattern.

### 2026-06-25 — Added `researcher` custom subagent
- Created `.ai/agents/researcher.md` + `.claude/agents -> ../.ai/agents` symlink (first subagent in
  the repo; established the `.ai/agents/` convention). Read-only research agent: `model: sonnet`,
  `tools: Read, Grep, Glob, Bash, WebSearch, WebFetch` (no write tools).
- Requirements baked into the prompt body (not enforceable via frontmatter): read-only Bash only,
  never invoke the `deep-research` skill, interview-mode for ambiguous/empty prompts, two structured
  output templates (project vs internet), explicit "Not found / gaps" honesty section.

### 2026-06-26 — Intent Layer feature via 4-wave implementer orchestration
- Built the "Intent Layer" (`.ai/plans/intent-layer.md`) end-to-end with `implementer` agents in
  waves: A (shared contracts + `pr_intent` schema + cheap `review_intent` model default) ‖ B
  (reviewer-core pure `generateIntent`) → C (server `modules/intent/`) ‖ D (client hook + IntentPanel).
  Integrated each wave file-by-file from the agents' `worktreePath` (see What Works), then reviewed
  with `architecture-reviewer` (verdict: sound; 2 SUGGESTION nits) + `plan-verifier` (17/17 covered).
- The two review agents are complementary and BOTH worth running after an implement pipeline:
  architecture-reviewer found horizontal-coupling smells (intent service importing `loadDiff` from the
  reviews slice's internals; repo built inline instead of wired in the container) that plan-verifier —
  which only checks requirement COVERAGE with file:line evidence — is designed NOT to flag. Neither
  was blocking.
- Much of a "new" feature was pre-scaffolded (contracts `Intent`/`Risk`/`PrIntentRecord`, the
  `pr_intent` table, the `review_intent` feature-model entry, the Settings model-picker UI) — the
  research pass up front turned a presumed greenfield build into mostly wiring. Always research for
  existing stubs before planning (mirrors the server `conventions`-lesson pattern).

### 2026-06-26 — Agent optimization pass (6 themes)
- Extracted duplicated agent content into **`.ai/rules/`** (`skill-routing`, `citation-contract`,
  `read-insights-first`, `architecture-map`); all 10 agents now Read-reference them instead of
  embedding (kills the lockstep-drift burden the README warned about). The skill-routing list still
  must stay in sync with the `AGENTS.md` table — but now it's ONE rules file, not 3 agent copies.
- **Answered the long-standing Open Question** (does description+routing kill the ~50% activation
  coin-flip?): added a deterministic `PreToolUse` hook (`.claude/hooks/skill-routing.py` +
  `.claude/settings.json`) that maps edited file path → required skills and injects an
  `additionalContext` reminder. Shipped the non-blocking reminder variant (deny-variant documented but
  risks false-positives). This is the determinism lever the model-mediated routing lacked.
- Re-tiered `investigator`+`insight-curator` → `haiku`; set `effort` per agent (judges high, mechanical
  low). Baked the worktree-integration protocol (commit+report-SHA, `git merge <feature-branch>` for
  deps, verify-deliverables-exist gate) into implementer/test-writer — codifying this session's
  worktree pain. Added the `backend-testing` skill (test-writer no longer embeds backend conventions),
  optional structured-output JSON schemas to the 3 reviewer agents, and `.ai/agents/METRICS.md` (a
  manual agent-eval ledger — a `SubagentStop` hook can't know the accept/redo/abandon outcome).

## Open Questions

- Is description+routing enough to kill the ~50% coin-flip in practice, or is a file-path→skill hook
  needed? Pending a fresh-session smoke test (touch `client/` → expect `frontend-architecture`;
  Drizzle query → expect `drizzle-orm-patterns` via the routing table; pre-push must NOT auto-fire
  `pr-self-review`).
