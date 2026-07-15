# Retro — SPEC-03 PR Why + Risk Brief (artifact-only brief call)

**Session** `a48cecc7` · 19 SPEC-03 agents (of 41 in the session) · 2026-07-13

Same two-feature session as the SPEC-02 retro — SPEC-02 (onboarding) and SPEC-03 (brief) ran
interleaved in one transcript. The numbers below are the **SPEC-03 slice only**: agents split by
description (`brief`/`PrBrief`/`SPEC-03`/`RepoFileViewer`/`head_sha` → SPEC-03), giving 19 brief
agents. **Main-session tokens are shared** across both features and are not attributed here.

Pipeline: `spec-creator` → `implementation-planner` → 9 task `implementer`s (incl. 1 fix) → 3
`test-writer`s → `plan-verifier` ×2 ‖ `architecture-reviewer` ×2 → `doc-writer`.

## Metrics (SPEC-03 agents only)

| Metric | Value |
|---|---|
| Agents | 19 (8 implementer + 1 fix-implementer, 3 test-writer, 2 plan-verifier, 2 architecture-reviewer, 1 each spec-creator / implementation-planner / doc-writer) |
| **Output tokens** | **319,041** — *corrected; the script reported 46,669 (see Action 1)* |
| **Cache-write** | 2,186,541 |
| Cache-read | 47,815,518 (95 % of the 50.1 M agent-token total) |
| Tool calls | 773 |
| Tool errors | 21 (2.7 % of calls) |
| Max concurrent | 4 |
| Parallelism factor | 1.47 (serial 98 min ÷ wall clock 66 min, SPEC-03 agents only) |
| Status | **19 of 19 backgrounded** (`async_launched`) — zero completed in-context |

Per agent type (corrected output):

| Type | n | Mean tokens | Total output | Mean active |
|---|---|---|---|---|
| test-writer | 3 | **4.90 M** | 86,098 | **474 s** |
| implementer | 9 | 2.48 M | 102,864 | 225 s |
| implementation-planner | 1 | 2.24 M | 54,937 | 858 s |
| spec-creator | 1 | 3.38 M | 23,166 | 587 s |
| plan-verifier | 2 | 2.73 M | 32,087 | 299 s |
| doc-writer | 1 | 0.78 M | 10,596 | 141 s |
| architecture-reviewer | 2 | 0.60 M | 9,293 | 109 s |

## What was hard

**The retro script under-reported this run's output 6.8×** — reported 46,669, real 319,041. That is
the worst of the three runs measured so far, and the factor is *growing each time*: SPEC-01 was 2.6×,
SPEC-02 4.3×, SPEC-03 6.8×. Because the distortion scales with how heavily agents were backgrounded and
resumed — and this run backgrounded **every** agent — the reported Output column is not just low, it is
low by an amount that changes run to run. Any trend the ledger appears to show on reported numbers is
an artifact of the bug, not of the runs.

**The test wave was the cost center, not the implementers.** The three `test-writer`s averaged **4.90 M
tokens and 474 s active** — roughly double the implementers' 2.48 M / 225 s. `T9 brief integration
tests` alone was **8.04 M tokens, 641 s active, 39,276 corrected output** — the single largest agent in
the entire session, SPEC-02 and SPEC-03 combined. Integration tests over the brief pipeline (real
Postgres, artifact assembly, a mocked LLM, cache-hit/miss, head-SHA invalidation) are genuinely
context-heavy, but this says the test wave — not the feature build — is where SPEC-03's tokens went.

**The planner was again the top per-agent output producer** (54,937 output, 858 s active), the same
shape as SPEC-02's planner. Two consecutive runs put the planner at ~55–58 K output and ~14–18 min
active, well clear of any implementer — a consistent, addressable cost.

**Every agent was backgrounded, so the parent booked ≈0 for the whole fleet.** In-context accounting
for this slice is completely blind; the numbers here exist only because they were recomputed from the
19 subagent transcripts.

## What was duplicated

37 files were read by more than one SPEC-03 agent. The heavy repetition:

| Reads | File | By |
|---|---|---|
| 9 | `.ai/plans/pr-why-risk-brief.md` | planner, implementer, test-writer, plan-verifier |
| 8 | `specs/SPEC-03-pr-why-risk-brief-2026-07-13.md` | spec-creator, planner, implementer, test-writer, plan-verifier, doc-writer |
| 6 | `PrBriefCard.tsx` | implementer, architecture-reviewer, plan-verifier, doc-writer |
| 6 | `server/src/vendor/shared/contracts/brief.ts` | spec-creator, planner, implementer, plan-verifier |
| 5 each | `brief/service.ts`, `brief/assemble.ts`, `brief/prompt.ts`, `server/INSIGHTS.md` | mixed |
| 4 each | `smart-diff/service.ts`, `intent/service.ts`, `blast/service.ts` | planner, implementer, spec-creator |

The plan was read 9× and the spec 8×. Beyond the plan/spec, the notable cluster is the **four upstream
artifact services** (`smart-diff`, `intent`, `blast`, plus the `buildSpecBlocks` reader): the whole
feature is an artifact composer (spec G1), so the planner, implementers, and spec-creator each went to
`smart-diff/service.ts`, `intent/service.ts`, and `blast/service.ts` to learn what those artifacts
contain. That is the same "consumer of a stable upstream surface" pattern SPEC-02 hit with the
`repoIntel` facade — and the same fix applies: hand the artifact shapes to the agents in the brief.

**`Bash` was 406 of 773 tool calls (53 %)** — consistent with the prior two runs.

## What we missed

- **Third consecutive retro blocked on the same unfixed script bug.** The output undercount has now
  been filed as the top action in all three retros; each retro re-does the hand-correction, and the
  distortion is getting worse, not better.
- **Two agents invoked zero skills: `T11 e2e brief flow` and `T3 brief system prompt`.** The e2e gap is
  the third straight run where the e2e implementer skips skill routing (SPEC-01 and SPEC-02 both did the
  same) — this is now a reliable pattern, not noise. `T3` (authoring a system prompt) has no obvious
  routing-table entry, so its empty `skillsInvoked` is arguably correct; the e2e one is not.
- **`architecture-reviewer` ran twice** — once on the brief diff, once to re-review a `RepoFileViewer`
  shared-component extraction. That second pass is the threshold-crossing-duplication cleanup the review
  gate is meant to catch, and it cost only 0.18 M tokens / 41 s — a cheap, well-scoped re-review, worth
  noting as the pattern working rather than a problem.
- **Parallelism 1.47 with max 4 concurrent**, across a 9-implementer + 3-test-writer feature. Like
  SPEC-02, the fleet ran in dependency-gated waves (contract → assemble/prompt → service/routes → card →
  tests), so the parallelism win was modest but expected.

## Actions

1. **Fix `scripts/retro.mjs` to keep the max (or last) `usage` per `message.id`.** Filed in all three
   retros now; still open. It under-reported this run 6.8×, and the factor is climbing (2.6× → 4.3× →
   6.8×) as runs background more agents, so the ledger's Output trend is currently unreadable. This is
   the single highest-value fix on the list. *(Motivated by: reported 46,669 vs corrected 319,041.)*
2. **Hand the upstream artifact shapes to the brief agents in their briefs.** The four artifact services
   (`smart-diff`, `intent`, `blast`, `buildSpecBlocks`) were each read 4× because the feature composes
   them and every agent had to learn their shapes from source. A one-page "artifacts you consume and
   their fields" block would remove most of those reads. *(Motivated by: `smart-diff`/`intent`/`blast`
   `service.ts` read 4× each; plan 9×, spec 8×.)*
3. **Budget the test wave explicitly, or split its integration tests.** The 3 test-writers cost ~2× the
   implementers per agent, and one integration test-writer was the session's single largest agent (8.04
   M tokens, 641 s). If that is acceptable for the coverage it buys, fine — but it should be a conscious
   choice, and a very large integration test-writer is a candidate to split by test file. *(Motivated
   by: test-writer meanTok 4.90 M vs implementer 2.48 M; `T9 brief integration tests` 8.04 M / 641 s.)*
4. **Give the e2e implementer explicit skill routing.** Three straight runs show the e2e task invoking
   no skills. Name the required skills in the e2e brief, or add the e2e path to the routing hook's map —
   this is now a confirmed recurring gap, not a one-off. *(Motivated by: `T11 e2e brief flow`
   skillsInvoked = [], matching SPEC-01 and SPEC-02.)*
5. **Tag agents by feature at dispatch when a session runs two features.** Same action as the SPEC-02
   retro — splitting this session required regex-matching descriptions after the fact. A `[SPEC-03]`
   prefix would make per-feature retros mechanical. *(Motivated by: 41 interleaved agents, no feature
   field in the transcript.)*
