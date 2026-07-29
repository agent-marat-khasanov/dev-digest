# evals

Evals for the DevDigest Claude Code harness — **skills** (`.ai/skills/*`), **subagents**
(`.ai/agents/*`), and **workflow-level** behavior (`CLAUDE.md`/`AGENTS.md` + on-disk config).
Plain **vitest + the Claude Agent SDK**, in the same toolchain as the rest of the repo (`pnpm`).

Runs on the Claude Code **subscription** by default — the API key is stripped from spawned
processes, so calls use the login / credential helper, never per-token API billing. No external
services, no third-party judge.

> This is the **core, subscription-only** port of the upstream harness. The upstream's OpenRouter
> LiteLLM proxy (cheap-model CI in Docker) and its GitHub Actions workflows are **not bundled** here
> — see [What is not bundled](#what-is-not-bundled). The engine still carries the OpenRouter
> content-tier path (`EVAL_BACKEND=openrouter`), so you can wire cheap models later without a rewrite.

## Install

This package is self-contained — it only lives in the `evals/` folder and never touches `server/`
or `client/`. It is deliberately **not** an npm package: it reads your `.ai/skills/*` and
`.ai/agents/*` by relative path, and you write cases in it — so the code sits in front of you, not
hidden in `node_modules`.

```bash
cd evals && pnpm install
```

## Three tiers

1. **Static gate (no model)** — `pnpm eval:quality` checks SKILL.md structure/frontmatter/links.
2. **Quality evals (LLM-judged)** — per skill/agent, isolate the artifact's *content* and judge it.
3. **Workflow evals (trace-asserted)** — load the real harness and check *systemic* behavior:
   does a subagent get dispatched, does a skill activate, does `CLAUDE.md` change what gets read.

On top of the tiers sit three statistical tools: **repeat** (run one thing N times → stability),
**delta** (diff two labeled repeat runs → version-vs-version), **benchmark** (run with vs without
the artifact → measured lift). All three read the same persisted `results/records.jsonl`.

## Two ways to run a case (and why)

- **`skillTask` / `agentTask`** inject the artifact's content as the system prompt and load **no**
  on-disk config. This isolates the artifact's *content* — the right question for skill/agent
  quality. (Relies on the SDK default `settingSources: []`, which reads nothing from disk.)
- **`workflowTask`** loads the real harness (`settingSources: ["project"]` → `CLAUDE.md` + project
  skills/agents). The *systemic* tier: does a skill actually **activate**, does a subagent actually
  get **dispatched**, does `CLAUDE.md` change behavior? A content-only eval can't see this.

## Two scorers (both subscription-only)

- `patternMatch(output, expected)` — deterministic substring coverage, no model. Use it as a
  cheap first tier: don't pay the judge for what a substring settles. When a case has a `grounding`
  gate it runs first and must equal `1.0`; the judge is skipped if it fails (cheap-tier economy).
- `llmJudge(output, practices)` — one structured `query()` → strict JSON, binary PASS/FAIL per
  practice, PASS only with a verbatim evidence quote (the LLM Message Pattern). The judge defaults
  to a **stronger family** (`EVAL_JUDGE_MODEL=claude-sonnet-5`) than the task (`claude-haiku-4-5`)
  to soften single-model self-preference. On a shared subscription families still overlap — the
  real mitigations are *blind + binary + verbatim evidence*.

## Backends

The same eval tests run against two backends, chosen by `EVAL_BACKEND` — you never edit a test to
switch. The model name is a **separate** knob (`EVAL_MODEL` / `EVAL_JUDGE_MODEL`).

| `EVAL_BACKEND` | Runtime | Auth | Model name format |
|---|---|---|---|
| `subscription` *(default)* | Claude Agent SDK on the Claude Code login | none (API key stripped) | Anthropic ID — `claude-haiku-4-5` |
| `openrouter` | content tier → direct OpenAI-compatible call; tool tiers stay on the SDK | `OPENROUTER_API_KEY` | OpenRouter slug — `deepseek/deepseek-chat`, `anthropic/claude-haiku-4.5` |

The default (`subscription`) path needs nothing set. Under `openrouter` the **content tier**
(`skillTask` + the judge) talks to OpenRouter natively — no proxy needed for a non-Anthropic model.
The **tool tiers** (`agentTask`, `workflowTask`) run inside the SDK and only work out-of-the-box
with `anthropic/*` slugs; backing them with a cheap non-Anthropic model needs a translating proxy,
which is **not bundled in this port** (see below).

```bash
# 1. Local, Anthropic (default — set nothing)
pnpm eval:skills

# 2. OpenRouter + DeepSeek content tier (native, no proxy)
EVAL_BACKEND=openrouter \
EVAL_MODEL=deepseek/deepseek-chat \
EVAL_JUDGE_MODEL=deepseek/deepseek-chat \
OPENROUTER_API_KEY=sk-or-... \
pnpm eval:skills
```

> **Gotcha:** always set `EVAL_MODEL` together with `EVAL_BACKEND=openrouter` — the default
> `claude-haiku-4-5` is an Anthropic ID and OpenRouter won't find it. Use an OpenRouter slug.

## Module layout — `src/` (the engine)

Split by responsibility with one-directional dependencies (config knows nothing of runtime;
runtime nothing of scoring; the `dsl/` composes everything). Eval files import from the single
barrel `src/index.ts`, never by deep relative path.

```
src/
  config.ts             # all tunables: EVAL_MODEL, EVAL_JUDGE_MODEL, MAX_TURNS, EVAL_CONFIG,
                        #   thresholds, flaky bounds (20/80), cost-regression ratio (125%), tool allow-lists
  ansi.ts               # color constants + color() helper
  git.ts                # gitInfo() — short sha + dirty flag (shared by record.ts and repeat.ts)
  runtime/
    env.ts              # subscriptionEnv() — strips ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN
    run-claude.ts       # runClaude() — the headless turn-loop; Result / RunOptions / Metrics types
    run-openrouter.ts   # content-tier direct OpenAI-format call (used only under EVAL_BACKEND=openrouter)
    dispatch.ts         # runContent() — routes the content tier to Claude or OpenRouter
  artifacts/
    paths.ts            # REPO_ROOT / SKILLS_DIR (.ai/skills) / AGENTS_DIR (.ai/agents) / RESULTS_DIR
    load.ts             # skillContent() (SKILL.md + sibling *.md references), agentContent(), agentTools()
    fixture.ts          # fixtureReader(import.meta.url) — inline a case's fixtures into a prompt
  tasks.ts              # skillTask / agentTask / workflowTask — compose runtime + artifacts;
                        #   skill/agentTask skip injection under EVAL_CONFIG=baseline (benchmark lift)
  scoring/
    pattern-match.ts    # patternMatch() — deterministic substring coverage
    llm-judge.ts        # llmJudge(), parseVerdict(), Verdict, the judge rubric
  logging/
    log.ts              # logTrace() (tools/subagents/skills/reads/metrics), logVerdict()
  records/
    record.ts           # record() → results/records.jsonl + full output to results/outputs/<run>/<slug>.md
    stats.ts            # pure: calcStats(), loadRecords(), aggregate(), byConfig(), computeFlags()
    stats.test.ts       # the only non-model unit tests — the statistics math
    benchmark.ts        # eval:benchmark CLI (with vs without artifact)
  trend-reporter.ts     # vitest reporter: pass/fail rows → results/history.jsonl
  compare.ts            # eval:compare — run-flip view over history.jsonl
  repeat.ts             # eval:repeat — N runs of one pattern → stability stats
  delta.ts              # eval:delta — diff two labeled repeat runs
  scaffold.ts           # eval:scaffold — list skills/agents, generate template eval files
  skill-quality.ts      # eval:quality — static SKILL.md gate (no model)
  dsl/
    describe.ts         # describeSkill / describeAgent / describeWorkflow — labeled groups
    case.ts             # Case types; runSkillCases / runAgentCases / runWorkflowCases
  index.ts              # barrel — the only import surface for eval files
```

## Case layout — where your tests, prompts, and fixtures live

You bring your own skills/agents, so **you scaffold cases, not hand-copy files**:

```bash
pnpm eval:scaffold                 # list every skill/agent in .ai and whether it has evals
pnpm eval:scaffold <skill-name>    # generate evals/skills/<name>/{eval.ts, cases.ts, fixtures/}
pnpm eval:scaffold --agent <name>  # same under evals/agents/<name>/  (refuses to overwrite)
```

This package ships one **seeded example** — `skills/onion-architecture/` — so `pnpm eval:skills`
works out of the box and you have a worked case to copy. Everything else is yours to fill.

Cases live in the `evals/` package (**not** inside `.ai/skills/*` or `.ai/agents/*` — that folder
is the skill's *payload*; a fixture there would leak into the assembled prompt). The folders mirror
the artifacts one-to-one, and each case folder holds three kinds of file:

| File | Holds | Example |
|------|-------|---------|
| `*.eval.ts` | thin: `describe* + run*Cases` — *what* runs, nothing else | `onion-architecture.eval.ts` |
| `*.cases.ts` | the data: prompt, practices, grounding, threshold, maxTurns, kind | `onion-architecture.cases.ts` |
| `fixtures/` | raw inputs inlined into prompts (diffs, code, session traces) | `fixtures/widgets-service.ts` |

A thin eval file is the whole file:

```ts
import { describeSkill, runSkillCases } from "../../src";
import { cases } from "./onion-architecture.cases.js";

describeSkill("onion-architecture", () => runSkillCases("onion-architecture", cases));
```

`run*Cases` owns the one true **measure → record → assert** body (model call + scorers in a
`try`, `record()` in `finally`, `expect` strictly after). Case authors never write that loop.

### Skill / agent case (`SkillCase` / `AgentCase`)

Judge-and-grounding shaped. Same type for both tiers; only the task differs (`skillTask` vs
`agentTask`).

```ts
export const cases: SkillCase[] = [
  {
    name: "review flags widgets-module layering violations",
    kind: "quality",                       // "quality" (judge) · "grounding" (patternMatch only, must equal 1)
    prompt: reviewPrompt(),                // inlines the fixture
    practices: [                           // the judge scores each, PASS needs a verbatim quote
      "flagged the direct Drizzle query inside service.ts as a layering violation",
      // ...
    ],
    grounding: ["service.ts"],             // optional substrings that must ALL appear before the judge runs
    threshold: 0.6,                        // judge score gate
    maxTurns: 6,                           // optional
  },
];
```

### Workflow case (`WorkflowCase`)

Trace-asserted, not judged — a discriminated union routed by `kind`. The folder is organized by
*scenario*, not by a single artifact, because a workflow is cross-cutting.

| `kind` | Runs | Passes when |
|--------|------|-------------|
| `dispatch` | `workflowTask` | `result.subagents` contains `expectSubagent` |
| `activation` | `workflowTask` | `activated(result, skill) === shouldActivate` (positive **and** near-miss negative) |
| `contrast` | treatment (real repo) **and** control (empty tmpdir, `settingSources:[]`) | `expectFileRead` read in treatment, NOT in control |
| `trace` | one `workflowTask` | every provided `expectSubagents`/`expectSkills`/`expectFilesRead` holds |

## Commands & parameters

```bash
cd evals && pnpm install

pnpm eval:quality        # fast static gate (no model)
pnpm eval                # all quality + workflow evals, once
pnpm eval:skills         # just skills/
pnpm eval:agents         # just agents/
pnpm eval:workflow       # just workflow/
pnpm vitest run skills/onion-architecture       # one artifact
pnpm vitest run src/records/stats.test.ts       # the only non-model unit test (stats math)
```

### `eval:repeat` — stability of one thing

```bash
pnpm eval:repeat <vitest pattern> [-n times=5] [-t testNamePattern] [--label name]
pnpm eval:repeat skills/onion-architecture -n 5 --label baseline
```
Runs the pattern N times, then prints per-test pass rate, a per-**practice** table, and metric
stats (`turns`, `duration_ms`, `tokens_out` as mean ± stddev; n<5 prints an "indicative only"
caveat). `--label` saves the aggregate to `results/repeat-<label>.json` for delta.

### `eval:delta` — version vs version (the canonical loop)

The primary "before vs after a change" workflow. **Capture the baseline label BEFORE you edit.**

```bash
pnpm eval:repeat skills/onion-architecture -n 5 --label baseline   # BEFORE the edit
#   ...edit SKILL.md...
pnpm eval:repeat skills/onion-architecture -n 5 --label candidate  # AFTER the edit
pnpm eval:delta baseline candidate
```
Shows the delta at three levels: per-test pass rate, per-**practice** (the main signal), and metrics.

### `eval:benchmark` — measured lift (with vs without the artifact)

```bash
pnpm eval:benchmark skills/onion-architecture -n 5
```

Runs the *same case* in two configurations — **candidate** (skill injected) and **baseline**
(`EVAL_CONFIG=baseline` → no injection, raw model) — N times each, sequentially. The **difference**
is the artifact's measured value ("lift"): if candidate and baseline score the same, the artifact
adds nothing the model didn't already do. Both configs get the identical user prompt + fixture —
only the artifact (system prompt) toggles, so Δ is attributable to it alone. Writes
`results/benchmarks/<timestamp>/benchmark.{json,md}`. **Skills/agents only** — it refuses `workflow/`.

### `eval:compare` — run-flip history

```bash
pnpm eval:compare            # last two runs from results/history.jsonl
pnpm eval:compare --list     # list recorded runs
```

### Environment variables

| Env var | Default | Meaning |
|---------|---------|---------|
| `EVAL_BACKEND` | `subscription` | runner: `subscription` (Claude Code) or `openrouter` |
| `EVAL_MODEL` | `claude-haiku-4-5` | model under test. Anthropic ID on `subscription`; OpenRouter slug on `openrouter` |
| `EVAL_JUDGE_MODEL` | `claude-sonnet-5` | judge model (stronger family); same slug-format rule |
| `OPENROUTER_API_KEY` | — | required when `EVAL_BACKEND=openrouter` |
| `OPENROUTER_BASE_URL` | OpenRouter | override to point at a proxy for non-Anthropic tool-tier models |
| `EVAL_MAX_TURNS` | `8` | max agent turns per case |
| `EVAL_CONFIG` | `candidate` | `benchmark` sets this to `baseline` to skip artifact injection |
| `EVAL_QUIET` | unset | suppress per-run trace spam during multi-run aggregation |

## Records, statistics, flags

Every run appends one line to `results/records.jsonl` and the full model output to
`results/outputs/<run_id>/<slug>.md`. `results/` is gitignored and append-only — **deleting
`results/` is always safe**.

- **Sample stddev** (n−1). n<5 is indicative only — the tools say so.
- **Practice identity is the practice text.** Reword a practice and you start a new statistics
  series by design (a practice is a prompt; a reworded prompt is a different measurement).
- **Empty ≠ zero.** A series with n=0 renders `—` and flags `missing_data`; a series of n>0 all
  failing renders `0%` and flags `always_failing`. The two are never conflated.

Analyst flags (benchmark): `non_discriminating` (100% in both configs), `always_failing` (0% in
both), `flaky` (pass rate strictly 20–80% within a config), `cost_regression` (candidate mean
tokens > 125% of baseline), `missing_data` (a config has zero records for a test/practice).

## Which change → which run

| Change | Run |
|--------|-----|
| A skill's `SKILL.md` (quick check) | `pnpm vitest run skills/<skill>` |
| A subagent file (quick check) | `pnpm vitest run agents/<agent>` |
| `CLAUDE.md` / activation / dispatch | `pnpm eval:workflow` |
| Any artifact's structure | `pnpm eval:quality` |
| A `SKILL.md` edit you want to **measure** | repeat/delta loop: `--label baseline` before, `--label candidate` after, then `eval:delta` |
| New skill/agent — is it **worth its tokens**? | `pnpm eval:benchmark skills/<skill> -n 5` |
| Adding evals for one of **your** skills/agents | `pnpm eval:scaffold <name>` (or `--agent <name>`) |
| Model / Claude Code version | `pnpm eval` (whole suite) |
| Stats math changed | `pnpm vitest run src/records/stats.test.ts` |

## Safety

Sessions run with `permissionMode: "bypassPermissions"`, which auto-approves every call — so the
tool **set** is the only real boundary. `runClaude` therefore passes the list as SDK `tools`
(*"the base set of available built-in tools"*) and adds `disallowedTools`
(`Write, Edit, NotebookEdit, Bash`), which the SDK removes from the model's context entirely.

> **Do not use `allowedTools` alone for this.** Per the SDK's own docs it only means
> *auto-approved without prompting* — "to restrict which tools are available, use the `tools`
> option instead". An earlier version passed only `allowedTools`, and an `investigator` eval with
> a `Read, Grep, Glob` "allow-list" edited a fixture on disk. If you fork this runner, keep both.

`workflowTask` keeps a read-only list (`Read, Grep, Glob, Task, Agent, Skill`) and runs against the
LIVE repo. Note that `Task`/`Agent` let it spawn subagents, and a spawned subagent is not confined
to `cwd` — a `contrast` control run has been observed reading files from an unrelated project
elsewhere on the machine. Reads are harmless, but prefer a throwaway clone for the workflow tier if
that bothers you.

## What is not bundled

Trimmed from the upstream harness for this **core, subscription-only** port (add them back if you
need cheap-model CI):

- **`proxy/`** — the LiteLLM/OpenRouter translating proxy (Docker) that lets the *tool tiers* run
  on cheap non-Anthropic models. The content-tier OpenRouter path (`run-openrouter.ts`) is still here.
- **`scripts/litellm-proxy.sh`** + the `proxy:up/down/wait` npm scripts.
- **`.github/workflows/eval-*.yml`** — the per-PR CI workflows and `scripts/ci-detect.mjs`
  change-detector. See the upstream repo for the proxy-based Actions recipe.

## Deferred (recorded so it isn't rediscovered)

- **Data-driven case DSL** — markdown case files + a `gray-matter` loader + `{{file:...}}`
  placeholders. `*.cases.ts` already carries the same fields as typed TS; convert to markdown only
  once the case count grows enough to earn a parser. `run*Cases` won't change.
- **`--baseline <git-ref>`** via git worktree — rejected; the repeat/delta label discipline gives
  version-vs-version comparison without worktree lifecycle risk.
