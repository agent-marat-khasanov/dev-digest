# DevDigest Agents

Project-scoped **Claude Code custom sub-agents**. Each agent is a Markdown file with YAML frontmatter;
the frontmatter declares the agent (`name`, `description`, `tools`, `model`, optional `color`,
`isolation`) and the Markdown body is its system prompt.

## Convention

Canonical files live here in `.ai/agents/`; Claude Code discovers them through the symlink
`.claude/agents -> ../.ai/agents` (the same `.ai/`-canonical pattern used for `.claude/skills` and
`.claude/rules`). The orchestrator delegates to an agent based on its `description`; you can also call
one explicitly by name.

These are **not** the DevDigest DB-backed reviewer agents (`server/src/db/schema/agents.ts` +
`docs/agent-prompts/`, which emit findings JSON for diff review) — a different concept.

## Agents at a glance

| Agent | Model | Tools | Isolation | Purpose |
|-------|-------|-------|-----------|---------|
| `researcher` | sonnet | Read, Grep, Glob, Bash, WebSearch, WebFetch | — | Read-only research from the project or the web; returns a structured, cited report. |
| `planner` | opus | Read, Grep, Glob, Bash, Write, Skill | — | Produces a structured Development Plan and writes it to `.ai/plans/<feature>.md`. No code edits. |
| `implementer` | sonnet | Read, Edit, Write, Grep, Glob, Bash, Skill | `worktree` | Implements ONE scoped task from a plan (UI or backend); runs in parallel in its own git worktree. |
| `test-writer` | sonnet | Read, Edit, Write, Grep, Glob, Bash, Skill | `worktree` | Writes Vitest tests for UI (RTL) and backend (unit + testcontainers); behavior-focused. Runs in parallel. |
| `architecture-reviewer` | opus | Read, Grep, Glob, Bash, Skill | — | Read-only architectural review: dependency-rule / layering / boundary violations only. |
| `plan-verifier` | opus | Read, Grep, Glob, Bash, Skill | — | Read-only: verifies every plan requirement is actually implemented, with file:line evidence. |
| `doc-writer` | sonnet | Read, Edit, Write, Grep, Glob, Bash, Skill | — | Documents code / converts plans into docs / produces markdown with Mermaid diagrams; knows where each doc goes. |
| `brainstorm` | opus | Read, Grep, Glob, Bash, Skill | — | Read-only: generates & weighs 3–5 solution options before code (Best-of-N), recommends one. |
| `investigator` | sonnet | Read, Grep, Glob, Bash | — | Read-only, project-only: codebase search + dependency tracing; returns a concise cited report. |
| `insight-curator` | sonnet | Read, Grep, Glob, Bash | — | Read-only: dedupes module `INSIGHTS.md` and recommends promotions (to skills / docs / specs). |

## How they fit together

A **research → brainstorm → plan → implement → verify → document** flow, plus read-only helpers that
slot in anywhere.

1. **`researcher`** (web + project) / **`investigator`** (project-only search & dependency tracing) —
   gather facts when something needs investigating.
2. **`brainstorm`** — before committing to an approach, generate and weigh options, recommend one.
3. **`planner`** — turns the chosen approach into a Development Plan at `.ai/plans/<feature>.md`, each
   task tagged with **required skills** and a **parallel group**.
4. **`implementer`** — builds one scoped task (invokes required skills, keeps tests green, self-reviews
   its own diff), in parallel, each in its own worktree.
5. **`test-writer`** — writes the behavior tests (UI + backend), in parallel, in its own worktree.
6. **`architecture-reviewer`** (structure) and **`plan-verifier`** (requirement coverage vs the plan
   or spec) — read-only checks after the work; they can run in parallel.
7. **`doc-writer`** — documents the shipped functionality or turns the plan into docs/diagrams.
8. **`insight-curator`** — periodically dedupes the `INSIGHTS.md` files and recommends what to promote.

The `.ai/plans/` directory is the handoff point between planner, implementer, and plan-verifier.

---

## `researcher`

Read-only research specialist with two modes — **project** (code/docs/config/git) and **internet** —
each with its own structured output template (Summary / Findings / Sources or Key files / Not found /
Confidence). Sonnet-only, no write tools, interview mode for ambiguous prompts, and explicitly never
uses the `deep-research` skill.

**Based on:** the user's own requirements/specification for this agent. **No external sources** — it
was designed from the brief, following the repo's existing agent-file conventions.

## `planner`

Project-aware senior architect. Reads the project (and relevant `INSIGHTS.md`), chooses one simplest
approach, decomposes it into tasks with required-skills and parallel-group columns, mines a
`Known gotchas (from INSIGHTS)` section, and writes the plan to `.ai/plans/<feature>.md`. It mirrors
the implementer's two skill sets verbatim and carries the `Skill` tool so it plans within what the
implementer can actually do. It writes only the plan file — never application code.

**Based on:** the project's own conventions (CLAUDE.md Project Map, Skill Routing, Coding/Workflow
Rules, Do-Not-Touch, per-module INSIGHTS) **and** Claude Code sub-agent + plan-mode best practices.
See [Sources](#sources).

## `implementer`

Senior engineer that builds one scoped slice of a plan. **Mandatory skill routing** (not
discretionary): architecture/placement skill first, then framework skills — one set for backend
(`onion-architecture` → fastify/drizzle/postgres/zod/security/typescript), one for UI
(`frontend-architecture` → react/next/RTL/zod/security/typescript). It keeps existing tests green
(new tests only when a task requires them), self-reviews **only its own code**, stops and asks when a
change exceeds the task's scope, and runs in an isolated git worktree for safe parallelism. It reports
candidate insights rather than editing `INSIGHTS.md` itself (to avoid parallel-worktree conflicts).

**Based on:** the project's mandatory Skill Routing **and** Claude Code sub-agent, parallel-worktree,
and definition-of-done best practices. See [Sources](#sources).

## `test-writer`

Writes Vitest tests for **UI** (invokes `react-testing-library`; RTL query priority, `userEvent`,
co-located `*.test.tsx`, intl/query providers) and **backend** (no backend-testing skill exists, so
conventions are embedded: unit `*.test.ts`, integration `*.it.test.ts` via testcontainers
`startPg()`/`dockerAvailable()`, Fastify `.inject()`; grounded in `TESTING.md`). Behavior-focused;
forbids over-mocking, asserting on mocks, snapshot spam, framework tests, brittle selectors. Maps each
requirement to a happy + edge test; runs the suite green; reports candidate insights. Parallel-safe
via `isolation: worktree`.

**Based on:** `TESTING.md` + the `react-testing-library` skill **and** test-generation research
(over-mocking / agent-generated-tests studies, Testing Library, Fastify, Kent C. Dodds). See
[Sources](#sources).

## `architecture-reviewer`

Read-only (no write access). Reviews **structure only** — dependency-rule / layering / boundary
violations, coupling, misplacement — and explicitly ignores naming, style, performance, and tests.
Invokes `onion-architecture` / `frontend-architecture` first; embeds the project's layer map and
dependency rule; cites `file:line`; uses the project severity/verdict/findings-discipline rubric.

**Based on:** the `onion-architecture` / `frontend-architecture` skills + the `docs/agent-prompts`
review conventions **and** architecture-review research (CoT, evidence-anchoring, out-of-scope list).
See [Sources](#sources).

## `plan-verifier`

Read-only. Given a plan **or a spec/requirements document** (e.g. `.ai/plans/<feature>.md`) + the
code, it builds an **evidence-gated traceability matrix**: each requirement → `MET | PARTIAL |
MISSING` with `file:line` / test evidence. Never marks MET without a citation; flags drift; approves
only when all requirements are MET. Focuses on **requirement coverage**, not code quality
(anti-rubber-stamp).

**Based on:** the project skills + `docs/agent-prompts` conventions **and** requirements-traceability
/ evidence-accumulation research. See [Sources](#sources).

## `doc-writer`

Documents implemented functionality from code, converts plans into docs, and turns inputs into
structured markdown **with Mermaid diagrams** (invokes `mermaid-diagram`). Knows **where** each doc
type goes (Diataxis + docs-as-code): module `README.md`, `docs/architecture.md`, ADRs in `docs/adr/`
(Nygard), `docs/guides/`, `docs/reference/`, `docs/features/`. Grounded in the code — marks unverified
claims, cites `file:line`, omits a diagram rather than inventing one.

**Based on:** the `mermaid-diagram` skill + Diataxis + Nygard ADR **and** grounded-doc-generation
research (DocAgent, Write the Docs). See [Sources](#sources).

## `brainstorm`

Read-only options explorer. Before code, it grounds itself in the codebase, generates **3–5 diverse
options** through distinct lenses (simplest-first / risk-first / performance-first / fewest-deps),
weighs them on a small rubric with hard pass/fail gates (guarding against first-option bias), and ends
with **one opinionated recommendation** plus an uncertainty note. Every option must cite a real file
it fits; no hallucinated or generic options. Good as Best-of-N.

**Based on:** Anthropic "Building Effective Agents" + Tree-of-Thoughts / self-consistency + LLM-as-
judge rubric & position-bias research. See [Sources](#sources).

## `investigator`

Read-only and **project-only** (no internet — that's `researcher`). A narrow codebase
search-and-trace specialist: layered search (ripgrep → ast-grep), **dependency tracing in both
directions** (callers and importers, checking barrel re-exports and path aliases), and only asserting
relationships a concrete match confirms. Returns conclusions with `file:line` citations and a "what I
searched" trail — never raw file dumps.

**Based on:** the official Claude Code **Explore** agent design + LocAgent / RepoAudit dependency-
tracing + citation-grounding research. See [Sources](#sources).

## `insight-curator`

Read-only curator of the project's `INSIGHTS.md` files. Reads all of them, **clusters duplicates**
(stating what would be lost before recommending any merge — never collapses silently), and recommends
**promotions** mapped to a target (procedure → skill; decision → docs/ADR; cross-module constraint →
spec). Recommendations only, with provenance and confidence. The read-only complement to the
`engineering-insights` skill (which writes insights).

**Based on:** A-MEM / agent-memory-consolidation research + lessons-learned lifecycle (PMI) +
Anthropic skill-promotion guidance. See [Sources](#sources).

---

## Sources

All agents except `researcher` were grounded in the references below (gathered via the `researcher`
agent during this project). The `researcher` agent itself was built from the user's spec and has no
external sources. The full per-agent Development Plan lives at `.ai/plans/new-agents.md`.

**Sub-agents & skills — official (Anthropic)** — used by all agents
- Create custom subagents — https://code.claude.com/docs/en/sub-agents
- Run agents in parallel — https://code.claude.com/docs/en/agents
- Extend Claude with skills — https://code.claude.com/docs/en/skills
- Agent Skills overview — https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- Skill authoring best practices — https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- Equipping agents for the real world with Agent Skills — https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- Building Effective Agents — https://www.anthropic.com/research/building-effective-agents
- Steering Claude Code: skills, hooks, rules, subagents — https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more

**Planning / parallelism — practitioner** — `planner`, `implementer`, `test-writer`
- Armin Ronacher, "What Actually Is Claude Code's Plan Mode?" — https://lucumr.pocoo.org/2025/12/17/what-is-plan-mode/
- PubNub, "Best practices for Claude Code sub-agents" — https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/
- DEV Community, "Conversational Development Part 7: @architect sub-agent" — https://dev.to/cristiansifuentes/conversational-development-with-claude-code-part-7-designing-sub-agents-for-planning-meet-1nlk
- Zylos Research, "Git Worktree Isolation Patterns for Parallel AI Agent Development" — https://zylos.ai/research/2026-02-22-git-worktree-parallel-ai-development/
- Medianeth, "Claude Code Frameworks & Sub-Agents Engineering Guide" — https://www.medianeth.dev/blog/claude-code-frameworks-subagents-2025

**Testing** — `test-writer`
- Testing Library — About Queries — https://testing-library.com/docs/queries/about/
- Fastify — Testing Guide — https://fastify.dev/docs/latest/Guides/Testing/
- Kent C. Dodds — The Testing Trophy — https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications
- Kent C. Dodds — Testing Implementation Details — https://kentcdodds.com/blog/testing-implementation-details
- Kent C. Dodds — How to Know What to Test — https://kentcdodds.com/blog/how-to-know-what-to-test
- "Are Coding Agents Generating Over-Mocked Tests?" — https://arxiv.org/html/2602.00409v1
- "Rethinking the Value of Agent-Generated Tests" — https://arxiv.org/html/2602.07900v1

**Architecture review & plan verification** — `architecture-reviewer`, `plan-verifier`
- CAPRA: Multi-Agent Architecture Assessment — https://arxiv.org/html/2606.18976v1
- Evaluating LLMs for Detecting Architectural Decision Violations — https://arxiv.org/html/2602.07609
- Guideline-Grounded Evidence Accumulation for High-Stakes Agent Verification — https://arxiv.org/pdf/2603.02798
- IEEE — A tool for detecting dependency violations in layered architecture — https://ieeexplore.ieee.org/document/6978182/

**Documentation** — `doc-writer`
- Diataxis (documentation framework) — https://diataxis.fr/
- Mermaid — syntax reference — https://mermaid.js.org/intro/syntax-reference.html
- Michael Nygard, "Documenting Architecture Decisions" — https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions.html
- ADR (Architecture Decision Records) — https://adr.github.io/
- DocAgent (grounded doc generation) — https://arxiv.org/html/2504.08725v1
- Write the Docs — docs-as-code — https://www.writethedocs.org/guide/docs-as-code/

**Brainstorm / option exploration** — `brainstorm`
- Tree of Thoughts (Yao et al., NeurIPS 2023) — https://arxiv.org/abs/2305.10601
- Self-Consistency Improves Chain-of-Thought — https://arxiv.org/abs/2203.11171
- Barriers to Diversity in LLM-Generated Ideas — https://arxiv.org/pdf/2602.20408
- Position Bias in Rubric-Based LLM-as-a-Judge — https://arxiv.org/pdf/2602.02219

**Investigation / dependency tracing** — `investigator`
- Claude Code "How and when to use subagents" (Explore design) — https://claude.com/blog/subagents-in-claude-code
- LocAgent: Graph-Guided LLM Agents for Code Localization — https://arxiv.org/html/2503.09089v1
- RepoAudit: Autonomous LLM-Agent for Repository-Level Code Auditing — https://arxiv.org/html/2501.18160v1
- Citation-Grounded Code Comprehension — https://arxiv.org/pdf/2512.12117

**Insight curation / agent memory** — `insight-curator`
- A-MEM: Agentic Memory for LLM Agents (NeurIPS 2025) — https://arxiv.org/abs/2502.12110
- Memory for Autonomous LLM Agents (survey) — https://arxiv.org/pdf/2603.07670
- Knowledge Management and Lessons Learned — PMI — https://www.pmi.org/learning/library/knowledge-management-lessons-learned-10161

---

## Maintenance

- `planner` and `implementer` mirror the **same two skill sets** (backend / UI); `architecture-reviewer`
  and `test-writer` route to those same skills. If the project's Skill Routing changes, update them in
  lockstep (also noted in `.ai/skills/INSIGHTS.md`).
- `test-writer` embeds backend test conventions because **no backend-testing skill exists** — if one is
  added later, route to it and trim the embedded section.
- `doc-writer` will create `docs/architecture.md`, `docs/adr/`, `docs/guides/`, `docs/reference/`, and
  `docs/features/` on first use; only `docs/agent-prompts/` exists today.
