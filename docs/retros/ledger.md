# Run ledger

One row per multi-agent run analysed with `/workflow-retro`. Append only — the point is the trend.

Tokens are as reported by `scripts/retro.mjs` (deduped per API response). **Output** and **cache-write**
are the tokens that cost real money; **cache-read** is shown because it dominates the raw total and
would otherwise mislead. Durations are *active* time, excluding idle gaps from resumed agents.

| Date | Session | Run | Agents | Output | Cache-write | Cache-read | Tool calls | Max conc. | Parallelism | Top action |
|------|---------|-----|--------|--------|-------------|------------|------------|-----------|-------------|------------|
| 2026-07-12 | `5d615f37` | [SPEC-01 Project Context](2026-07-12-project-context.md) | 23 | 534,923 † | 3,342,564 | 98,999,568 | 1,252 | 5 | 1.65 | Fix `retro.mjs` usage dedupe (keeps first line, must keep last) — it under-reports output 2.6× |
| 2026-07-13 | `a48cecc7` | [SPEC-02 Onboarding Generator](2026-07-13-onboarding-generator.md) ‡ | 22 | 323,167 † | 2,273,470 | 43,497,976 | 820 | 4 | 1.36 | Fix `retro.mjs` usage dedupe (still open from the SPEC-01 row) — under-reported this run 4.3× |
| 2026-07-13 | `a48cecc7` | [SPEC-03 PR Why+Risk Brief](2026-07-13-pr-why-risk-brief.md) ‡ | 19 | 319,041 † | 2,186,541 | 47,815,518 | 773 | 4 | 1.47 | Fix `retro.mjs` usage dedupe (3rd row; undercount now 6.8× and growing per run) |

† Output corrected by hand: `scripts/retro.mjs` reported 202,612 (SPEC-01), 74,855 (SPEC-02), 46,669 (SPEC-03) — undercount 2.6× / 4.3× / 6.8×. See Action 1 in each linked retro.
‡ Slice of a two-feature session (SPEC-02 + SPEC-03 in one transcript); agents split by description, main-session tokens shared and excluded.
