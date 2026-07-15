---
name: workflow-retro
description: "MANUAL-ONLY post-mortem of a multi-agent run for DevDigest. Do NOT auto-load; do NOT invoke after a pipeline finishes, before commits, or as a wrap-up habit. Invoke ONLY when the user explicitly types `/workflow-retro` or asks for it by name. Reads the session transcripts from disk via scripts/retro.mjs and reports how the RUN behaved — tokens by category, cache-hit, tool calls, durations, parallelism, per-agent and per-agent-type — then turns that into concrete actions and appends a row to docs/retros/ledger.md. Does NOT review code quality (use pr-self-review) and does NOT record engineering insights (use engineering-insights)."
---

# /workflow-retro — how did the run actually go?

A multi-agent run (`spec-creator` → `implementation-planner` → `implementer`s → `test-writer` →
`architecture-reviewer` ‖ `plan-verifier`) leaves a detailed trace on disk. This command reads it and
answers a question nothing else in the repo answers: **how did the run behave** — what it cost, where
it stalled, what context it paid for twice, which agent earned its tokens.

It reviews the *run*, not the *result*. Code quality is `pr-self-review`'s job.

## Step 1 — Collect the metrics

```sh
node scripts/retro.mjs                 # current session (default)
node scripts/retro.mjs last            # most recent session that had subagents
node scripts/retro.mjs a48cecc7        # a specific session (id prefix is enough)
```

Write the JSON to your scratchpad and read it from there — it is large.

**Never count tokens by reading the transcript yourself.** Two traps make hand-counting wrong, and
the script exists because both bit us:

1. **One API response is written as several JSONL lines** (one per content block), and every line
   repeats the same `usage` object. Summing lines inflated output tokens **5×** and cache-reads
   **2.1×** in a real measurement. The script dedupes on `message.id`.
2. **An agent resumed later** (via `SendMessage`, possibly the next day) has a huge hole in its
   timeline. First-to-last timestamp reported a 10-minute agent as a 13-hour one. The script splits
   the timeline on idle gaps >5 min and reports `activeMs` (real work) alongside `spanMs`.

## Step 2 — Read the numbers honestly

The report is per-agent, per-agent-type, and whole-run. Four things you must not misread:

- **`totals.grandTotalTokens` is not "what this cost".** It is dominated by `cacheRead`, which is the
  cheapest token there is. Lead with `breakdown.output` and `breakdown.cacheWrite`; mention
  `cacheRead` as context, not as a headline. (In one real run: 376 K output vs 218 M cache-read.)
- **`inContextUndercount`** compares what the parent session *booked* for a subagent against what that
  subagent's own transcript shows. Two separate effects:
  - For agents the parent saw finish, its `totalTokens` is only the **last turn**, not the run — a
    **×25** undercount in a real measurement.
  - For **backgrounded** agents (`status: async_launched`) the Task result returns before the agent
    finishes, so the parent books ≈0. `excludedAgents` counts these. When most of the fleet is
    backgrounded, in-context accounting is not merely low — it is **blind**.
- **`activeMs` vs `spanMs`.** Use `activeMs`. A large gap between them means `wasResumed` — say so
  rather than reporting a fake duration.
- **`concurrency.parallelismFactor`** = serial time ÷ wall clock. ~1.0 with a large fleet means the
  agents effectively ran one after another.

## Step 3 — Turn numbers into insights

Every insight must cite a number from the JSON. No vibes, no "seemed slow".

| Look at | What it means | Action it implies |
|---|---|---|
| `duplicateReads` | N agents each read the same file — you paid for that context N times | Pre-fetch once and put the content (or a summary) in the agent brief; or narrow the brief so they stop reaching for it |
| An agent with huge `tokens.total` but tiny `tokens.output` | It read a lot and produced little | Over-briefed, or scoped too wide — tighten the brief |
| High `toolErrors` | The agent fought its tools | Usually a wrong path/command in the brief |
| `parallelismFactor` ≈ 1.0 with many agents | They ran serially | Dispatch parallel agents in ONE message |
| `concurrency.maxConcurrent` below the fan-out you intended | Agents queued | Reduce fan-out, or split the batch |
| `skillsInvoked` missing a skill that `.ai/rules/skill-routing.md` requires | Skill routing failed for that agent | Strengthen the brief, or the skill's description |
| `status` other than `completed` | The agent died or was still running | Say so plainly; do not average it into the stats |
| `byAgentType.meanTokens` | Which agent type is expensive per invocation | Merge, split, or downgrade the model for that type |

## Step 4 — Write the report

`docs/retros/<YYYY-MM-DD>-<slug>.md`:

```markdown
# Retro — <what the run was building>

**Session** `<id>` · <N> agents · <date>

## Metrics
<a short table: agents, output tokens, cache-write, cache-read, tool calls, max concurrent,
parallelism factor, wall clock>

## What was hard
## What was duplicated
## What we missed
## Actions
<numbered, concrete, each citing the metric that motivates it>
```

## Step 5 — Append the ledger row

Add one row to `docs/retros/ledger.md` so runs can be compared over time. Do not restructure the
table; append.

## Boundaries

- **Read-only with respect to the codebase.** This command writes only `docs/retros/`.
- **No dollar figures.** The script emits the four raw token categories on purpose; pricing is
  deliberately out of scope so it can be layered on later without touching this skill.
- **Do not record engineering insights here** — that is `engineering-insights`, and it writes to a
  different place (module `INSIGHTS.md`).
