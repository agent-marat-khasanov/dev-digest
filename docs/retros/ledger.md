# Run ledger

One row per multi-agent run analysed with `/workflow-retro`. Append only — the point is the trend.

Tokens are as reported by `scripts/retro.mjs` (deduped per API response). **Output** and **cache-write**
are the tokens that cost real money; **cache-read** is shown because it dominates the raw total and
would otherwise mislead. Durations are *active* time, excluding idle gaps from resumed agents.

| Date | Session | Run | Agents | Output | Cache-write | Cache-read | Tool calls | Max conc. | Parallelism | Top action |
|------|---------|-----|--------|--------|-------------|------------|------------|-----------|-------------|------------|
| 2026-07-12 | `5d615f37` | [SPEC-01 Project Context](2026-07-12-project-context.md) | 23 | 534,923 † | 3,342,564 | 98,999,568 | 1,252 | 5 | 1.65 | Fix `retro.mjs` usage dedupe (keeps first line, must keep last) — it under-reports output 2.6× |

† Output corrected by hand: `scripts/retro.mjs` reported 202,612. See Action 1 in the linked retro.
