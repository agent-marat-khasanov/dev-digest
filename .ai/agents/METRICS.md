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

## Review cadence

Every few sessions (or when an agent feels off), scan for patterns: an agent with repeated
**redone**/**abandoned** rows is a prompt-quality signal → fix the agent definition (and capture the
fix via `engineering-insights`). An agent that's always **accepted** at a high tier is a candidate to
**down-tier** (cheaper model/effort) — confirm with an A/B. Feed recurring lessons to
`insight-curator` for promotion.
