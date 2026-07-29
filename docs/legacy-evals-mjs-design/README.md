# Evals — AI-harness evaluation setup

**This is NOT the product's eval feature** (`server/src/modules/evals` — the in-app skill-eval
studio). This is the single source of documentation for evaluating the AI harness itself: skills
(and, later, subagents). One shared contract, per-category sections below.

## Shared contract (applies to every category)

- **Case** = input/prompt → expected outcome → machine-graded assertions. No case without a trap:
  if both arms of an A/B pass it, it teaches nothing.
- **Assertion kinds**: `detect` (passes iff some reported finding overlaps the assertion's
  file+line span) and `decoy` (passes iff the sanctioned pattern is NOT flagged). Decoys are the
  main discriminator — false positives the expertise prevents, not extra detections.
- **Fixtures** carry planted problems with NO hint comments; expected findings live only in
  `assertions.json`. Check every planted "violation" against the real codebase first — if the
  repo's own convention does the same thing, it is not a violation here.
- **Gate semantics**: `--gate` = regression gate, non-zero exit on any failed assertion. Grading is
  deterministic and free; only live agent runs cost tokens.
- **Artifacts**: runs land in gitignored `.runs/evals/`; after a meaningful run, append a row to
  `evals/ledger.md` (append-only: date · target · commit · score per arm · notes, including any
  grader arbitration).
- When arbitrating a grader failure, fix the assertion only when the finding is defensible under
  the evaluated component's own rules — and record the arbitration in the notes.

## Category: skill evals (active)

Cases live **inside the skill's folder** — the skill is deliverable across the team as one
self-contained directory, evals included:

```
.ai/skills/<skill-name>/
├── SKILL.md, <reference files>
└── evals/
    ├── evals.json          # cases: prompt, expected_output, review config (fixture, context)
    ├── assertions.json     # detect/decoy assertions with file+line spans
    └── fixtures/           # planted-violation code slices
```

Caveat: for **vendored** skills (`skills-lock.json`) a re-sync from upstream may clobber the skill
directory — re-check `evals/` survives after any re-vendor.

Two shapes exist for `onion-architecture`:
- **Generative** (eval ids 0–4, iterations 1–2): agent proposes new files ("proposal mode"),
  graded by `scripts/evals/grade-proposals.mjs` regex checks. Retired ids kept for history.
- **Review-mode** (eval ids 5+, iteration 3+): agent reviews a fixture and writes `FINDINGS.json`,
  graded by `scripts/evals/grade-review.mjs`.

Running:

```sh
# CI regression gate (with_skill arm only): does the skill push the model somewhere wrong?
node scripts/evals/run-review-evals.mjs --gate

# A/B value measurement (both arms), specific evals:
node scripts/evals/run-review-evals.mjs --arm both --evals 5,6,7

# Preview prompts without spending tokens:        # re-grade an existing run:
node scripts/evals/run-review-evals.mjs --dry-run # node scripts/evals/grade-review.mjs .runs/evals/<run> --gate
```

The runner shells out to `claude -p`; extra CLI flags via `CLAUDE_EVAL_ARGS` (default
`--permission-mode acceptEdits`). Another skill's suite: `--skill <name>` (expects
`.ai/skills/<name>/evals/` in this same format).

## Category: agent evals (placeholder — none authored yet)

An agent is a single file (`.ai/agents/<name>.md`), not a folder, so agent cases will NOT live
inside the deliverable; they go here instead:

```
evals/agents/<agent-name>/   # cases + fixtures, same contract as skills
```

What differs from skill evals (to be encoded in a future runner, not a new doc regime):
- **Behavior cases**: the agent does its OWN job in a live headless run (does the read-only agent
  refuse writes; does it cite file:line; does it stop where it must). A/B = old vs new agent prompt.
- **Dispatch cases**: judge a recorded orchestrator decision (right agent picked, scoped prompt,
  result actually used) — source material is session transcripts / METRICS.md incidents.
- Live-cost gating (env opt-in) and N-trials-with-threshold for non-deterministic behavior.

## CI integration (manual dispatch — a live-LLM run costs real tokens)

```yaml
# .github/workflows/skill-evals.yml
name: skill-evals
on: workflow_dispatch
jobs:
  regression-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm install -g @anthropic-ai/claude-code
      - run: node scripts/evals/run-review-evals.mjs --gate
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          CLAUDE_EVAL_ARGS: --permission-mode bypassPermissions
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: eval-results, path: .runs/evals/ }
```

## Machinery map

| Piece | Path |
|---|---|
| Headless runner (skill review-mode) | `scripts/evals/run-review-evals.mjs` |
| Review-mode grader (detect/decoy) | `scripts/evals/grade-review.mjs` |
| Generative-mode grader (regex) | `scripts/evals/grade-proposals.mjs` |
| Run history (all categories) | `evals/ledger.md` |
| Run artifacts (gitignored) | `.runs/evals/` |
| Authoring lessons | `.ai/skills/INSIGHTS.md` (What Works / What Doesn't Work) |
