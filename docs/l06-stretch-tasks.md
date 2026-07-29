# L06 — Stretch tasks (1, 4, 5)

Companion to `docs/learnings.md` (the product Eval Pipeline). Stretch 2 (Case Editor) and
Stretch 3 (Trend charts) shipped inside the product feature; the three below are separate
harness / tooling / test-quality tracks.

---

## Stretch 1 — Eval for a skill in `evals/`

**Problem it solves.** A skill's `SKILL.md` has no regression net — an edit to its description or
rules can quietly change its behavior, and you find out a week later from a strange review.

**What shipped.** An eval package for the **`security`** skill, mirroring the lab pattern
(`evals/skills/onion-architecture/*`):

- `evals/skills/security/security.eval.ts` — thin: `describeSkill("security", () => runSkillCases("security", cases))`.
- `evals/skills/security/security.cases.ts` — 3 `SkillCase`s run via `skillTask` (SKILL.md as system
  prompt, no tools; fixtures inlined into the prompt):
  1. **Multi-vuln catch** — a fixture with SQL injection, `jwt.decode()` instead of `verify()`, an IDOR,
     and a hardcoded Stripe key; the LLM-judge practices require the review to name each.
  2. **Decoy discrimination** (the discriminating case) — a real IDOR alongside a *safe* `fetch(process.env.CONFIG_URL)`
     and a *parameterized* query; practices require flagging the IDOR **and staying silent** on the two safe
     patterns (the skill's golden rule: server-controlled input is safe).
  3. **NoSQL operator injection + mass assignment** (`$set: req.body`).

> Note: `security` is a stand-in for "the skill you wrote in L02" — swap in your own by copying this
> file pair. The `evals/` package is untracked in this repo (same as the seeded `onion-architecture`/
> `dependency-checker` evals), so these files live on disk in the package, not on the feature branch.

**How to run / calibrate (needs an LLM key — real model call):**
```bash
cd evals && pnpm eval:skills            # or: pnpm vitest run skills/security
```
Read the judge's PASS/FAIL with verbatim evidence, then tighten the `practices` wording until the
verdict is stable. **Break-then-fix drill:** weaken the skill (e.g. delete the "golden rule" line from
`security/SKILL.md`) → the decoy case should go **red** (it now false-flags the safe env fetch) → revert
→ green. From then on the skill is regression-protected like ours.

---

## Stretch 4 — PreToolUse hook: a deterministic commit gate

**Problem it solves.** Evals are *probabilistic* (a threshold). Some rules must hold **always** — e.g.
"don't commit with a red scorer." That's the deterministic rung of the L02 reliability ladder: a **hook**,
not an eval.

**What shipped.**
- `.claude/hooks/test-gate.sh` — a PreToolUse hook that inspects the Bash command; on a `git commit`
  it runs `pnpm verify:l06` and **blocks** the commit (exit 2, message fed back to the agent) if the
  eval scorer is red. Fails **open** (allows) if `jq` is missing or the input shape is odd, so it can
  never wedge unrelated Bash calls.
- `.claude/settings.json` — a second `PreToolUse` entry (matcher `Bash`) alongside the existing
  `skill-routing.py` (matcher `Edit|Write`).

**Real caught case (demonstrated).** Mutating `overlaps` in `score.ts` (`<=` → `>=`, see Stretch 5)
made `verify:l06` red; a `git commit` attempt was then **blocked**:
```
BLOCKED by test-gate: 'pnpm verify:l06' is RED — the eval scorer regressed. Fix it before committing.
gate exit=2
```
Reverting the mutation returned the gate to green (allow). So: *probabilistic → evals; critical → hook* —
two different answers to two classes of rule.

---

## Stretch 5 — Mutation testing on one module

**Problem it solves.** Green tests say "the current code passes" but are silent about their own quality:
would they catch a logic swap?

**Module:** `server/src/modules/evals/score.ts` — the pure scorer that `verify:l06` guards (an eval for
the tests of the eval scorer — "check the checker" one level down).

**Finding (a real surviving mutant).** Mutating the overlap operator
`a.start_line <= b.end_line` → `a.start_line >= b.end_line` **survived**: `verify:l06` stayed **green
(10/10)**. Root cause: every existing test used *exact same-line* spans (`start === end`, mostly line 10),
where `<=` and `>=` give the same result — so the overlap-tolerance logic (the whole reason `overlaps`
exists: "the model reported a slightly different line in the same hunk") was never actually exercised.

**Killing tests added** (`score.test.ts`, "overlap tolerance" block):
- expected `10-12` vs actual `11-13` (offset overlap) → must match, recall 1
- expected `11-13` vs actual `10-12` (reverse offset) → must match, recall 1
- disjoint `10-10` vs `12-12` → must NOT match, recall 0

With these, the mutant is **killed** (`2 failed | 11 passed`); on correct code the suite is **13/13
green**. Net: `verify:l06` went from 10 → 13 tests and now pins the overlap semantics.

**Running a full automated sweep (optional).** To let a tool enumerate every mutant of `score.ts`:
```bash
cd server
pnpm dlx -p @stryker-mutator/core -p @stryker-mutator/vitest-runner stryker run \
  --testRunner vitest --mutate "src/modules/evals/score.ts"
```
(Not added as a devDep here to keep the homework branch lean; the manual mutation above already
demonstrated the exercise end-to-end.)
