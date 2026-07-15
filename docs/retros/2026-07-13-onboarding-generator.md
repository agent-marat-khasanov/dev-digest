# Retro — SPEC-02 Onboarding Generator (facts-first repo tour)

**Session** `a48cecc7` · 22 SPEC-02 agents (of 41 in the session) · 2026-07-13

This session ran **two features back-to-back in one transcript** — SPEC-02 (onboarding) and SPEC-03
(PR why/risk brief). The numbers below are the **SPEC-02 slice only**: agents were split by
description (`brief`/`PrBrief`/`SPEC-03`/`RepoFileViewer`/`head_sha` → SPEC-03; the rest → SPEC-02),
giving 22 onboarding agents vs 19 brief agents. The **main-session tokens are shared** across both
features (and the session was resumed across 19 activity segments), so they are deliberately *not*
attributed to SPEC-02 here.

Pipeline: `Explore` + `spec-creator` → `implementation-planner` → 12 task `implementer`s + 3 fix
`implementer`s → 3 `test-writer`s → `plan-verifier` ×2 ‖ `architecture-reviewer` → `doc-writer`.

## Metrics (SPEC-02 agents only)

| Metric | Value |
|---|---|
| Agents | 22 (12 implementer + 3 fix-implementer folded in, 3 test-writer, 2 plan-verifier, 1 each spec-creator / implementation-planner / architecture-reviewer / doc-writer / Explore) |
| **Output tokens** | **323,167** — *corrected; the script reported 74,855 (see Action 1)* |
| **Cache-write** | 2,273,470 |
| Cache-read | 43,497,976 (95 % of the 45.9 M agent-token total — cheapest tokens, not the headline) |
| Tool calls | 820 |
| Tool errors | 23 (2.8 % of calls) |
| Max concurrent | 4 |
| Parallelism factor | 1.36 (serial 102 min ÷ wall clock 75 min, SPEC-02 agents only) |
| Status | 20 of 22 backgrounded (`async_launched`); only `spec-creator` + `Explore` completed in-context |

Per agent type (corrected output):

| Type | n | Mean tokens | Total output | Mean active |
|---|---|---|---|---|
| implementer | 12 | 2.24 M | 133,393 | 217 s |
| test-writer | 3 | 2.86 M | 49,971 | 314 s |
| implementation-planner | 1 | 2.14 M | 58,366 | 1,075 s |
| spec-creator | 1 | 3.10 M | 32,040 | 616 s |
| plan-verifier | 2 | 1.27 M | 23,413 | 185 s |
| architecture-reviewer | 1 | 1.04 M | 9,233 | 164 s |
| Explore | 1 | 0.36 M | 9,027 | 179 s |
| doc-writer | 1 | 1.31 M | 7,724 | 176 s |

## What was hard

**The retro script under-reported this run's output 4.3×** — worse than the SPEC-01 run's 2.6×. It
keeps the *first* `usage` line per `message.id`, but those lines are written incrementally, so the
true output is the *last/max* line. The `implementation-planner` is the extreme case: booked at 15,270
output tokens, it really produced **58,366** — a single agent the script under-counted by ~43K. This
is the same defect flagged in the SPEC-01 retro (Action 1 there); it is still unfixed and it distorts
every run differently, so cross-run comparison on the *reported* numbers is meaningless until it lands.

**The planner was the most expensive single agent by output and by far the longest** — 58,366 output
tokens over **1,075 s (18 min) of active work**, 2.5× the runtime of any implementer. For a two-gate
planning agent that is partly the job, but it also read the plan, the spec, and `repo-intel/service.ts`
repeatedly (see below), so some of that span was re-reading context it could have been hopscotch-fed.

**Two `spec-creator`/`Explore` agents completed in-context; the other 20 were backgrounded.** The
parent therefore booked ≈0 for 20 of 22 agents — in-context accounting for this run is blind, exactly
as the ledger warns. The only trustworthy numbers are the ones recomputed from the subagent
transcripts, which is what this report uses.

## What was duplicated

35 files were read by more than one SPEC-02 agent. The load-bearing repetition:

| Reads | File | By |
|---|---|---|
| 10 | `.ai/plans/onboarding-generator.md` | planner, implementer, plan-verifier |
| 7 | `server/src/modules/repo-intel/service.ts` | Explore, spec-creator, planner, implementer, plan-verifier |
| 6 | `specs/SPEC-02-onboarding-generator-2026-07-12.md` | spec-creator, planner, implementer, test-writer, plan-verifier |
| 6 | `server/src/prompts/onboarding.system.md` | spec-creator, planner, implementer, doc-writer |
| 5 each | `repo-intel/types.ts`, `onboarding/service.ts`, `server/INSIGHTS.md` | mixed |

The plan was pulled into context **ten times** and `repo-intel/service.ts` **seven times**. The whole
feature is a *consumer of the `repoIntel` facade* (per the spec's G1/NG2), so every implementer,
the planner, and the verifiers all reached for `service.ts` to learn the facade surface. That surface
is small and stable — a one-page "facade methods you may call, with signatures" block in the brief
would have removed most of those seven reads.

**`Bash` was 428 of 820 tool calls (52 %)** — the same working-directory / git churn seen in the
SPEC-01 run.

## What we missed

- **The token-undercount fix from the last retro never shipped**, so this retro had to redo the same
  hand-correction. That is two retros in a row spending effort to work around a two-line script bug.
- **`T13 e2e onboarding flow` invoked zero skills.** This is the second run where the e2e implementer
  skipped skill routing entirely (SPEC-01's e2e fix agent did the same). Every other implementer's
  `skillsInvoked` matched `.ai/rules/skill-routing.md` (client tasks → `frontend-architecture`, server
  tasks → `onion-architecture`, migration → `postgresql-table-design`), so routing held *except* on
  e2e — a consistent, addressable gap in the e2e brief.
- **Parallelism was 1.36 with a max of 4 concurrent**, across a 15-implementer feature. The fleet ran
  in waves gated on shared dependencies (contracts → service → page), so much of the implementer batch
  was queued rather than fanned out — expected given the dependency chain, but it means the wall-clock
  win from parallelism was modest.

## Actions

1. **Fix `scripts/retro.mjs` to keep the max (or last) `usage` per `message.id` — for real this time.**
   The SPEC-01 retro already filed this; it is still open, and it under-reported *this* run's output
   4.3× and one agent by ~43K. Until it lands, every ledger row's Output column is a different-sized
   fiction and the trend the ledger exists to show is unreadable. *(Motivated by: reported 74,855 vs
   corrected 323,167; planner 15,270 → 58,366.)*
2. **Put the `repoIntel` facade surface in the brief instead of citing `service.ts`.** A short "these
   are the facade methods and signatures you may call" block would remove most of the 7 reads of
   `repo-intel/service.ts` and the planner's re-reads. The feature is a pure consumer of that facade,
   so the brief can hand over the exact contract. *(Motivated by: `service.ts` read 7×; plan read 10×.)*
3. **Give the e2e implementer explicit skill routing in its brief.** Two consecutive runs show the e2e
   task invoking no skills while every sibling implementer routes correctly. Name the required skills
   in the e2e brief (or add e2e to the routing hook's path map). *(Motivated by: `T13 e2e onboarding
   flow` skillsInvoked = [].)*
4. **Slim the planner's inputs — it is the run's output and time sink.** 58,366 output tokens and 18
   min active, much of it re-reading the spec, plan, and facade. Feed it the spec's `Inputs
   (provenance)` citations pre-resolved rather than letting it trace `service.ts` from scratch (the
   SPEC-01 planner note in INSIGHTS already recommends this — it did not fully take here). *(Motivated
   by: planner meanActive 1,075 s vs implementer 217 s; planner corrected output highest in the run.)*
5. **When one session runs two features, tag agents by feature at dispatch.** Splitting this run
   required regex-matching descriptions after the fact, which is fragile (the ambiguous "Architecture
   review of feature diff" and "T10 server unit tests" had to be reasoned out). A `[SPEC-02]` prefix in
   each agent description would make per-feature retros mechanical. *(Motivated by: 41 interleaved
   agents, no feature field in the transcript.)*
