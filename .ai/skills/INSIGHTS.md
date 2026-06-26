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

## Recurring Errors & Fixes

## Session Notes

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
