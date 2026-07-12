---
name: impl
description: "MANUAL-ONLY implementation-pipeline runner for DevDigest (the execution half of Spec-Driven Development). Do NOT auto-load. Invoke ONLY when the user explicitly types `/impl` or asks for it by name. Input: an existing Implementation Plan (path in .ai/plans/ or feature name). The spec and the plan are produced SEPARATELY beforehand (manual spec-creator / implementation-planner runs) — this command only executes: multi-agent implementers → plan-verifier ‖ architecture-reviewer → user-gated fix iterations → final plan-verifier → doc-writer. test-writer is currently DISABLED in this pipeline (token economy) — tests are run/authored manually."
---

# /impl — implementation pipeline (plan → shipped feature)

You (the main session) are the **orchestrator**. The spec and the Implementation Plan already
exist — `spec-creator` and `implementation-planner` are run **manually, outside this command**.
You execute the plan: dispatch agents, integrate their output, relay review findings to the user,
and keep the run honest.

**Core rules — apply to every phase:**

- **Artifacts are the handoff.** Pass agents file PATHS (plan, spec, branch name) — never paste
  file contents into a dispatch prompt.
- **Parallel dispatches go in ONE message** (multiple Agent calls).
- **The only gate is the findings gate** (Phase 3). Everything else runs autonomously; stop only
  on hard blockers (blocked implementer, `request_changes` loop with nothing left to select).
- **Report honestly.** A failed agent run is reported as failed, never papered over.
- **test-writer is disabled** in this pipeline for now (token economy). Do not dispatch it. ACs
  whose `Verify:` tag needs tests are listed in the final report as "tests pending (manual)".

## Arguments

- **Plan** — a path (`.ai/plans/<feature>.md`) or a feature name (Glob `.ai/plans/` for it; zero
  or several matches → ask).
- Derive the **spec path** from the plan header (`**Spec:** <path>`); if the plan has no spec
  reference, proceed with the plan alone and note it in the final report.

No plan found → say so and stop: the plan is written by a manual `implementation-planner` run;
this command does not plan.

## Phase 1 — Implement

1. Create the feature branch (`git checkout -b feature/<slug>` from the default branch).
2. Read the plan's Tasks table, Implementation sequence, and execution mode.
3. **Per wave** (a parallel group in multi-agent mode; one task at a time in single-agent mode):
   - Dispatch ALL implementers of the wave in one message. Each prompt: plan path, its task
     number, the feature branch name (for `git merge <branch> --no-commit` dependency pulls).
   - On each return: verify the reported **SHA and deliverable files actually exist** in its
     worktree; integrate into the feature branch by **cherry-pick/merge — never `cp -r`**.
   - Integrate the whole wave before dispatching the next.
4. An implementer that reports a blocker → stop and ask the user.
5. Collect every "Candidate insights" list for the wrap-up.

## Phase 2 — Verification round

Dispatch in ONE message (both read-only, they run in parallel):

- **`plan-verifier`** (pass 1) — verify against the **spec's `AC-n`** (source of truth), using the
  plan's *Covers* column as the map. Give it both paths (plan only, if no spec).
- **`architecture-reviewer`** — review the feature diff (`git diff main...feature/<slug>` file
  list).

## Phase 3 — Findings gate (user decides; loop)

**Nothing is fixed automatically — the user selects.**

1. Present both reports, grouped: `CRITICAL` / `MISSING` / `PARTIAL` / `WARNING` / `SUGGESTION`,
   each finding with its file:line and one-line why.
2. AskUserQuestion: which findings to fix (multiSelect; "proceed without fixing" is a valid
   choice).
3. Dispatch targeted **`implementer`**(s) for the selected findings (parallel when files don't
   overlap), integrate as in Phase 1.
4. Re-run ONLY the reviewer(s) whose findings were addressed (plan-verifier for MISSING/PARTIAL,
   architecture-reviewer for CRITICAL/WARNING/SUGGESTION).
5. Present the updated reports; repeat 2–4 until the user says proceed. Findings the user declined
   are recorded for the final report — never silently dropped.

## Phase 4 — Final verify

Dispatch **`plan-verifier`** (final pass). `approve` → Phase 5; `request_changes` → back to the
findings gate (Phase 3) with the new gaps.

## Phase 5 — Wrap-up (automatic)

1. **`doc-writer`** — always dispatch: document the shipped feature from the code + spec.
2. Append a row to `.ai/agents/METRICS.md` for each non-trivial agent run (outcome:
   accepted/redone/abandoned).
3. Record collected candidate insights via the `engineering-insights` skill.
4. Final report to the user: spec ID + path (if any), plan path, branch + commit list, reviewer
   verdicts, findings the user declined to fix, and **ACs with tests pending (manual)** —
   everything whose `Verify:` tag was not exercised because test-writer is disabled.
