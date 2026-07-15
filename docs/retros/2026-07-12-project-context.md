# Retro — SPEC-01 Project Context (attachable repo docs → prompt)

**Session** `5d615f37-0ff8-4f40-8164-de670a7b7dae` · 23 agents · 2026-07-12

Pipeline: `spec-creator` → `implementation-planner` → 11 task `implementer`s → 3 fix-up `implementer`s
→ `plan-verifier` ×2 ‖ `architecture-reviewer` ×2 → `doc-writer`. Two `Explore` agents ran up front.

## Metrics

| Metric | Value |
|---|---|
| Agents | 23 (14 implementer, 2 plan-verifier, 2 architecture-reviewer, 2 Explore, 1 each spec-creator / implementation-planner / doc-writer) |
| **Output tokens** | **534,923** (main 129,341 · agents 405,582) — *corrected; see Action 1* |
| **Cache-write** | 3,342,564 |
| Cache-read | 98,999,568 (96 % of the 102.6 M grand total — cheapest tokens, not the headline) |
| Input | 89,316 |
| Tool calls | 1,252 (main 114 · agents 1,138) |
| Tool errors | 57 (4.6 % of calls; 46 of them inside agents) |
| Max concurrent | 5 |
| Parallelism factor | 1.65 (serial 122 min ÷ wall clock 74 min) |
| Wall clock (fleet) | 74 min of agent time; main session 101 min active, resumed across 6 segments spanning 8 h 47 m |

Per agent type (corrected output):

| Type | n | Mean tokens | Mean output | Mean active | Tokens read per token written |
|---|---|---|---|---|---|
| implementer | 14 | 4.24 M | 17,550 | 295 s | 242 : 1 |
| plan-verifier | 2 | 2.88 M | 13,704 | 297 s | 210 : 1 |
| architecture-reviewer | 2 | 1.38 M | 10,274 | 177 s | 134 : 1 |
| doc-writer | 1 | 1.78 M | 12,107 | 157 s | 147 : 1 |
| spec-creator | 1 | 2.77 M | 32,683 | 837 s | 85 : 1 |
| implementation-planner | 1 | 1.88 M | 37,912 | 827 s | 49 : 1 |
| Explore | 2 | 0.62 M | 14,610 | 212 s | 43 : 1 |

## What was hard

**The measurement tool was measuring wrong.** `scripts/retro.mjs` dedupes usage on `message.id` and
keeps the **first** line it sees. In this session's transcripts the per-line `usage` objects are
**incremental**, not repeated — for one planner response the `output_tokens` across its 4 lines read
`7, 7, 7, 214`. 617 of 997 responses in this run vary within the message. Keeping the first line
undercounted run output **2.6×** (202,612 reported vs 534,923 real) and the `implementation-planner`
**519×** (73 vs 37,912) — a number so absurd it is what exposed the bug. Cache and input fields do
*not* vary line-to-line (0 of 997), so only `output` is affected; every other figure in this report
is as the script reported it.

**In-context accounting was blind, as designed.** 22 of 23 agents were backgrounded
(`status: async_launched`), so the parent booked ≈0 tokens for them. The single agent it saw finish
(`spec-creator`) was booked at 89,515 tokens against a real 2,773,392 — a **×31** undercount. The
parent session had no usable view of what the fleet cost while it was spending it.

**The fix-up round was the most expensive part of the run.** Three of the fourteen implementers were
post-review fix agents, and they burned **18.96 M tokens — 25 % of all agent tokens**. The single
largest agent in the entire run was a fix ("Fix: AC-5 reason + arch warnings", 10.36 M tokens, 101
tool calls, 6 tool errors), costing 2.4× the mean implementer. It also invoked **eight** skills —
essentially the whole routing table — which is the signature of a brief too vague to tell it what it
was touching.

## What was duplicated

46 files were read by more than one agent. The top of that list is not incidental:

| Reads | File | By |
|---|---|---|
| 12 | `specs/SPEC-01-project-context-2026-07-12.md` | spec-creator, planner, implementer, plan-verifier, doc-writer |
| 12 | `.ai/plans/project-context.md` | planner, implementer, plan-verifier, doc-writer |
| 6 | `reviewer-core/src/prompt.ts` | 6 different agent types |
| 6 | `server/src/vendor/shared/contracts/platform.ts` | 5 agent types |
| 5 each | `config.ts`, `run-executor.ts`, `trace.ts`, `context/service.ts`, `context/routes.ts` | mixed |

The spec (338 lines) and the plan were each pulled into context **twelve times**. That is the single
clearest waste in the run: the brief hands every agent a *path* and lets it fetch, so the fleet paid
for the same 300+ lines a dozen times over.

`Bash` was **566 of 1,138 agent tool calls (50 %)**, and 109 of those were bare `cd <repo-root>`
prefixes — agents re-establishing their working directory instead of being given it.

## What we missed

- **Nobody caught the token undercount until this retro.** The skill's own Step 1 asserts "every line
  repeats the same `usage` object" — that assumption is false for this session's transcripts, and it
  is baked into the script.
- **Parallelism of 1.65 across 23 agents.** Max concurrent was 5; serial time (122 min) was only 1.65×
  wall clock (74 min). The fleet ran in waves, not in a fan-out — much of the 11-task implementer
  batch was effectively queued behind dependencies.
- **The two `plan-verifier`s and both `Explore`s invoked zero skills.** Correct for read-only agents,
  but it means `skillsInvoked` cannot be used as a routing-compliance signal for them — only the
  implementers can be audited that way, and there, routing held (every client-touching implementer
  invoked `frontend-architecture`; every server one invoked `onion-architecture`).

## Actions

1. **Fix `scripts/retro.mjs` to take the max (or last) `usage` per `message.id`, not the first.**
   Every number this skill produces depends on it, and today it under-reports output 2.6× at the run
   level and up to 519× at the agent level. Also correct the skill's Step 1 text, which states the
   opposite of what the transcripts show. *(Motivated by: 617/997 responses with intra-message
   variance; planner output 73 → 37,912.)*
2. **Inline the task's slice of the spec and plan into each agent brief instead of citing paths.**
   Twelve reads of the spec and twelve of the plan is context paid for twelve times. An implementer
   needs its own ACs and its own task block, not the whole 338-line document. *(Motivated by:
   `duplicateReads` top two entries, 12 readers each; implementer tokens-read-per-token-written =
   242 : 1.)*
3. **Give implementers their working directory and the file list in the brief.** Half of all agent
   tool calls were `Bash`, 109 of them just `cd` into the repo root or a worktree. *(Motivated by:
   566/1,138 Bash calls; 46 agent tool errors.)*
4. **Treat a fix-up agent as a full task, with a scoped brief.** The three fix agents cost 25 % of all
   agent tokens, and the worst one invoked eight skills because its brief ("AC-5 reason + arch
   warnings") never said which layer it was in. Name the files and the layer, and the skill routing
   narrows itself. *(Motivated by: 18.96 M tokens across 3 fix agents; 10.36 M in one.)*
5. **Dispatch the independent implementer tasks in one message.** A parallelism factor of 1.65 with a
   max of 5 concurrent agents, across an 11-task batch, means the fleet spent most of its wall clock
   partly idle. *(Motivated by: `parallelismFactor` 1.65, `maxConcurrent` 5, serial 122 min vs wall
   74 min.)*
6. **Stop reading the parent session's subagent token numbers.** With 22 of 23 agents backgrounded,
   the parent's accounting is not low — it is blind (×31 on the only agent it could see). Run
   `retro.mjs` (fixed) to know what a run cost. *(Motivated by: `inContextUndercount.excludedAgents`
   = 22, `factor` = 31.)*
