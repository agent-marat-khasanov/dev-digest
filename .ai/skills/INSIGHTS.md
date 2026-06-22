# Skills & Project-Docs INSIGHTS

Repo-meta knowledge about how skills and the AI entry-point docs work. Not tied to a code
module (server/client/reviewer-core/e2e) — lives here because it concerns `.ai/skills/` and the
root `AGENTS.md`/`CLAUDE.md`.

## What Works

- Directive skill descriptions activate far more reliably than passive ones. Lead with `<Domain>
  expert`, then `ALWAYS invoke this skill when <explicit trigger list>`, then a negative constraint
  `Do not <bypass action> directly — consult this skill first`. Keep any existing `Does NOT cover X —
  use <other-skill>` sentence to prevent overlapping-trigger confusion between sibling skills
  (frontend-architecture vs react-best-practices; onion vs fastify/drizzle).
- A `## Skill Routing` table in `AGENTS.md` (domain/file-path → skill, "MUST invoke first") is the
  only activation lever for vendored skills whose `SKILL.md` we don't edit on disk.

## What Doesn't Work

- Do NOT "mirror" a section into both `AGENTS.md` and `CLAUDE.md` — **`CLAUDE.md` is a symlink to
  `AGENTS.md`** (`ls -la CLAUDE.md` → `CLAUDE.md -> AGENTS.md`). They are the same file; editing one
  edits both. A second mirror edit duplicates the section. `git diff` shows only `AGENTS.md`.
- Do NOT edit vendored skill `SKILL.md` files in place to improve their descriptions. The 8 skills
  in `skills-lock.json` are pinned from GitHub with a `computedHash`; local edits diverge from the
  lock and get clobbered on re-sync. Drive their activation via the `AGENTS.md` routing table
  instead, or change the wording upstream.
- Do NOT apply the aggressive `ALWAYS invoke` template to manual/utility skills. `pr-self-review` is
  deliberately `"Do NOT auto-load... manual only"`; `engineering-insights` is a wrap-up trigger;
  `mermaid-diagram` is user-intent. Making these directive causes over-firing / breaks intended UX.

## Codebase Patterns

- Project skill definitions live in `.ai/skills/<name>/SKILL.md` (NOT `.claude/skills/`). The 4
  code-module `INSIGHTS.md` files cover code knowledge only; this file covers skills/docs meta.
- Skill activation is governed solely by the `description:` frontmatter field — there is no separate
  `trigger`/`when`/`auto-activate` field, and a `keywords` field has no effect. The `description:`
  often contains a colon (e.g. `OWASP Top 10:2025`), so it MUST be quote-wrapped to stay valid YAML.
- `engineering-insights` skill only targets the 4 code modules. Repo-meta work (skills, root docs)
  has no module home — record it here instead of forcing it into an unrelated module file.

## Tool & Library Notes

- `skills-lock.json` schema: `{ version, skills: { <name>: { source, sourceType, skillPath,
  computedHash } } }`. `source` is a `owner/repo` GitHub slug; `skillPath` is the path to `SKILL.md`
  within that repo. Local-only skills (project-specific) are absent from this lock.

## Recurring Errors & Fixes

## Session Notes

### 2026-06-22 — Skill activation tuning (directive descriptions + routing table)
- Audited 14 skills against the "Why Claude Code Skills Don't Activate" methodology: 11/14 used the
  weak passive `Use when ...` pattern (~50% activation per that study); only `drizzle-orm-patterns`
  said `Proactively use`.
- Rewrote 5 **local** domain skills to the directive template: `frontend-architecture`,
  `onion-architecture`, `react-best-practices`, `react-testing-library`, `security`.
- Left the 6 **vendored** domain skills (`fastify-best-practices`, `drizzle-orm-patterns`,
  `postgresql-table-design`, `next-best-practices`, `typescript-expert`, `zod`) unedited on disk
  (lock integrity) — covered them via a new `## Skill Routing` table in `AGENTS.md`.
- Left `pr-self-review`, `engineering-insights`, `mermaid-diagram` untouched by design.
- Chosen path is description + AGENTS.md routing, no hook. It is model-mediated, NOT
  code-deterministic. Hard determinism would require a `UserPromptSubmit`/`PreToolUse` hook mapping
  file-path → skill (consciously deferred).

## Open Questions

- Is description+routing enough to kill the ~50% coin-flip in practice, or is a file-path→skill hook
  needed? Pending a fresh-session smoke test (touch `client/` → expect `frontend-architecture`;
  Drizzle query → expect `drizzle-orm-patterns` via the routing table; pre-push must NOT auto-fire
  `pr-self-review`).
