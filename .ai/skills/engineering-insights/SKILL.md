---
name: engineering-insights
description: "Capture engineering insights during and after work sessions. Use this skill when you encounter non-obvious behavior, surprising solutions, dead ends, dependency quirks, recurring errors, or architectural decisions worth remembering. Also use as a session wrap-up after meaningful work (>30 min) that involved problem-solving, debugging, or discovery. Writes to the INSIGHTS.md file of the module you worked on (server, client, reviewer-core, or e2e). Do NOT use for trivial changes (typo fixes, config tweaks, boilerplate)."
---

# Engineering Insights

Capture hard-won knowledge so it persists across sessions. Every insight you record saves the next session from re-discovering the same lesson.

See `examples.md` for good vs bad entry examples.

---

## Process

### Step 1 — Identify the target module(s)

Which module(s) did this session touch?

- `server/INSIGHTS.md`
- `client/INSIGHTS.md`
- `reviewer-core/INSIGHTS.md`
- `e2e/INSIGHTS.md`

If work spanned multiple modules, write to each relevant file.

### Step 2 — Read the current INSIGHTS.md

Read the target file first. Check existing entries to avoid duplicates. If an existing entry is related, extend it rather than adding a new one.

### Step 3 — Identify insights from the session

Scan your session for entries that fit these sections:

| Section | What to capture |
|---------|-----------------|
| **What Works** | Approaches, patterns, solutions that succeeded |
| **What Doesn't Work** | Dead ends, anti-patterns, failed approaches — **most valuable section, do not skip** |
| **Codebase Patterns** | New conventions, architectural decisions made |
| **Tool & Library Notes** | Dependency quirks, version gotchas, config surprises |
| **Recurring Errors & Fixes** | Errors you fixed that are likely to recur, with the fix |
| **Session Notes** | Dated summary of significant sessions (use `### YYYY-MM-DD` heading) |
| **Open Questions** | Unresolved issues, things that need investigation |

### Step 4 — Apply the quality gate

Before writing, each entry MUST pass these checks:

1. **Specific and actionable "cold"** — another agent reads this entry with zero context and knows exactly what to do
2. **Non-obvious** — if anyone reading the code would know this, do not write it
3. **Not a duplicate** — the insight is not already in the file (check Step 2)

### Step 5 — Append to the correct section

- **APPEND ONLY** — never overwrite, rewrite, or reorganize existing entries
- Place each entry under the matching `## Section` heading
- Use `- ` bullet format for entries (one line per insight, or 2-3 lines max for complex ones)
- Date stamp Session Notes with `### YYYY-MM-DD` sub-heading
- If no insights qualify for a section, leave it unchanged

### Step 6 — Skip if nothing qualifies

If the session was trivial (config tweak, typo fix, boilerplate) or all potential insights fail the quality gate — do not write anything. Signal quality matters more than volume.
