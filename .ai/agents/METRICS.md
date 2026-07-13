# Agent Metrics — tooling-agent feedback loop

A lightweight ledger of how our `.ai/agents/` tooling agents actually perform, so we can tune their
prompts/models with data instead of guessing. The product's DB reviewer agents have
`GET /agents/performance`; this is the dev-loop equivalent for the orchestration agents.

## Why a manual ledger (not a fully-automated hook)

The signal that matters — was the agent's output **accepted**, **redone**, or **abandoned** — is a
post-hoc judgement made by the orchestrator/human *after* integration, which a `SubagentStop` hook
cannot know at stop time. (A hook could append raw completion events, but that churns a tracked file
on every agent stop and still can't record the outcome.) So the orchestrator appends one row per
non-trivial agent run, and we review the ledger periodically (pair with the `insight-curator`).

## How to log

After a non-trivial agent run, append a row. `tokens` is the rough subagent token count from the
Agent tool result (the `subagent_tokens` line); `outcome` is one of:

- **accepted** — output used as-is (or with trivial tweaks).
- **redone** — had to re-dispatch / heavily fix (note why — the prompt likely needs work).
- **abandoned** — output discarded / approach wrong.

| Date | Agent | Task (short) | Model/Effort | Tokens | Outcome | Note (esp. for redone/abandoned) |
|------|-------|--------------|--------------|--------|---------|----------------------------------|
| 2026-06-26 | implementer | Intent Group C (server module) | sonnet/medium | ~107k | redone | First run returned a layering plan but wrote ZERO files; re-dispatched with explicit "write+verify" clause |
| 2026-06-26 | implementer | Intent Group A/B/D | sonnet/medium | ~58–105k | accepted | Clean; worktree integration done by orchestrator |
| 2026-06-26 | architecture-reviewer | Intent Layer review | opus/high | ~61k | accepted | Found 2 real coupling SUGGESTIONs |
| 2026-06-26 | plan-verifier | Intent Layer coverage | opus/high | ~41k | accepted | 17/17 matrix with evidence |
| 2026-07-12 | spec-creator | SPEC-01 project-context (author + 2 fold-in resumes) | opus/high | ~90–111k/run | accepted | 2 resumes wasted re-planning in plan-mode read-only before edits could land — don't resume writers under plan mode |
| 2026-07-12 | implementation-planner | project-context plan (author + fold-in resume) | opus/high | ~112k+132k | accepted | 11 tasks / 30 ACs; open questions resolved via same-agent SendMessage resume |
| 2026-07-12 | implementer | T1–T11 project-context (11 parallel/waved runs) | sonnet/medium | ~59–166k each | accepted | All wrote+committed+verified in worktrees; zero redone; T5 largest (166k) |
| 2026-07-12 | implementer | Findings fixes A/B/C (AC-5+arch, e2e flow, contract fixtures) | sonnet/medium | ~61–164k | accepted | Fix-B correctly diagnosed seeded repo had clonePath:null and wired fixture |
| 2026-07-12 | architecture-reviewer | project-context diff (pass 1 + re-review) | sonnet/high | ~99k+46k | accepted | 2 real WARNINGs (container bypass, cross-module import); re-review confirmed resolved |
| 2026-07-12 | plan-verifier | SPEC-01 coverage (pass 1 + final) | sonnet/high | ~128k+77k | accepted | Caught AC-5 PARTIAL + 2 drift items pass 1; final: 28 MET / 2 MANUAL, approve |
| 2026-07-12 | spec-creator | SPEC-02 onboarding (author + fold-in + AC-1 amend resumes) | opus/high | ~89–112k/run | accepted | 8 clarifications closed in one user round; SendMessage resumes clean (no plan mode) |
| 2026-07-12 | implementation-planner | SPEC-02 plan (author + cross-review revision resume) | opus/high | ~110k+152k | accepted | Revision folded 5 cross-review blockers, task IDs stable, 26/26 AC coverage held |
| 2026-07-12 | (external) GPT-5.2 via OpenRouter | SPEC-02 plan cross-model staff review | gpt-5.2 | ~14k in/5.5k out | accepted | 2/5 blockers real (markdown-link bypass, model-authored commands); 1 convention false-positive (repo-blind routes claim) |
| 2026-07-13 | implementer | SPEC-02 T1-T5,T7-T9 (8 runs, 4 waves) | sonnet/medium | ~64–128k/run | accepted | All first-try; T9 landed as a merge commit → cherry-pick needed `-m 1` |
| 2026-07-13 | implementer | SPEC-02 fixes: AC-2 rank sort + AC-12 CTA | sonnet/medium | ~56k, ~73k | accepted | Targeted single-finding dispatches; CTA fixer correctly picked useRefreshRepo over useResyncRepoIntel |
| 2026-07-13 | plan-verifier | SPEC-02 coverage (pass 1 + final) | sonnet/high | ~102k+72k | accepted | Pass 1 caught prompt-only AC-2 enforcement + AC-1 literal deviation; final approve |
| 2026-07-13 | architecture-reviewer | SPEC-02 feature diff review | sonnet/high | ~86k | accepted | Zero findings; validated FileViewer duplication decision |

## Review cadence

Every few sessions (or when an agent feels off), scan for patterns: an agent with repeated
**redone**/**abandoned** rows is a prompt-quality signal → fix the agent definition (and capture the
fix via `engineering-insights`). An agent that's always **accepted** at a high tier is a candidate to
**down-tier** (cheaper model/effort) — confirm with an A/B. Feed recurring lessons to
`insight-curator` for promotion.
