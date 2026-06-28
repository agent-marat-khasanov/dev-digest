# Rule: Read INSIGHTS First (for planning / implementing / testing agents)

Before planning or writing code in a module, read that module's `INSIGHTS.md` and lead with these
sections — they encode hard-won, non-obvious lessons that prevent repeating past mistakes:

1. **What Doesn't Work** — dead ends and anti-patterns (most valuable).
2. **Recurring Errors & Fixes** — errors likely to recur, with the fix.
3. **Tool & Library Notes** — dependency quirks and version gotchas.

The INSIGHTS files live at: `server/INSIGHTS.md`, `client/INSIGHTS.md`, `reviewer-core/INSIGHTS.md`,
`e2e/INSIGHTS.md`, and `.ai/skills/INSIGHTS.md` (repo-meta: skills, agents, root docs).

A `planner` mines the relevant warnings into the plan's **Known gotchas (from INSIGHTS)** section
(each bullet citing its source) so the implementer inherits them. An `implementer`/`test-writer`
reads them directly before touching the module. Do not edit INSIGHTS during the task — report a
"Candidate insights" list instead; the main session records them once via `engineering-insights`.
