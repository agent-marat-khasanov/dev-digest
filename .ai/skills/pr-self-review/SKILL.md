---
name: pr-self-review
description: "MANUAL-ONLY local pre-push / pre-PR review for DevDigest. Do NOT auto-load; do NOT invoke before `git push`, `gh pr create`, commits, or any GitHub-mutating command. Invoke ONLY when the user explicitly types `/pr-self-review` or asks for it by name. When invoked, reads the full branch diff (`main...HEAD` plus uncommitted/staged changes), classifies every changed file by category (UI / backend / shared contracts / pure core / tests), applies the matching project skills (frontend-architecture, react-best-practices, next-best-practices, react-testing-library, onion-architecture, fastify-best-practices, drizzle-orm-patterns, postgresql-table-design, zod, typescript-expert, security) as review lenses, and runs per-module typecheck + tests. Reports findings with severity; the user — not the skill — decides whether to push."
---

# PR Self-Review

A **gate** that runs locally before code leaves the machine. Reads the diff, classifies each changed file, applies the project's existing skills as review lenses, runs typecheck + tests for every affected module, and **refuses the push if anything critical is found**.

**Scope:** orchestrating existing project skills against a branch diff, gating `git push` / `gh pr create` on critical findings.
**Out of scope:** authoring new review content (every rule comes from an existing skill), running CI, posting comments to GitHub, deciding what code *does* — only whether it is safe to push.

## Prime directive: nothing critical leaves the machine

Before code is sent anywhere shared, every changed file is read through the lenses that already exist as project skills. **A critical finding blocks the push.** A non-critical finding is reported and the user decides. The skill never silently approves — files that match no glob still get a brief generic review.

## When this skill fires

**Manual only.** The skill loads when the user explicitly invokes it:

| Trigger | Source |
|---|---|
| The user types `/pr-self-review` | Manual |
| The user asks for it by name ("run pr-self-review", "do a self review") | Manual |

The skill is **deliberately not** auto-invoked before `git push` / `gh pr create` / commits / any other GitHub-mutating call. If you are tempted to load it as a pre-push gate, stop — the user is the one who decides when to run it.

## Diff scope

The skill reviews **every change that would end up in the PR**, not just the last commit:

```
git diff --name-only main...HEAD       # committed-on-branch
git diff --name-only HEAD              # uncommitted (working tree + staged)
```

Union the two lists. If empty → exit clean. Otherwise classify each path with the table in [classification.md](classification.md).

## Lens table (summary — full version in classification.md)

| Path glob | Lenses applied |
|---|---|
| `client/src/app/**`, `client/src/components/**`, `client/src/lib/**` (non-test) | `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`, `security` |
| `client/**/*.test.{ts,tsx}` | `react-testing-library`, `typescript-expert` |
| `client/src/vendor/**` | **Refuse — `vendor/` is read-only per CLAUDE.md** |
| `server/src/modules/**/routes.ts` | `onion-architecture`, `fastify-best-practices`, `zod`, `security`, `typescript-expert` |
| `server/src/modules/**/service.ts` | `onion-architecture`, `typescript-expert` |
| `server/src/modules/**/repository.ts` | `onion-architecture`, `drizzle-orm-patterns`, `typescript-expert` |
| `server/src/adapters/**` | `onion-architecture`, `security`, `typescript-expert` |
| `server/src/db/schema/**`, `server/src/db/migrations/**` | `drizzle-orm-patterns`, `postgresql-table-design` |
| `server/src/vendor/shared/**` | `zod`, `typescript-expert` + sync warning to `client/src/vendor/shared/` |
| `reviewer-core/**` | `onion-architecture` (purity rule), `typescript-expert` |
| `e2e/**` | `typescript-expert` |
| **Always (on top of the above)** | `security` |

Anything matching no glob still gets a short generic review — log the path, do not skip silently.

## Per-module verification

For every module that owns at least one changed file, run **in parallel**:

```sh
cd <module> && pnpm typecheck && pnpm test
```

Modules: `client/`, `server/`, `reviewer-core/`, `e2e/`. A failing typecheck or test is a **critical** finding (see [severity.md](severity.md)) — it gates the push regardless of what the lenses say.

## Gating procedure (hard rules)

1. **Collect the diff.** Build the changed-file list from `git diff --name-only main...HEAD` ∪ `git diff --name-only HEAD`. If empty, exit clean.
2. **Refuse vendored edits.** If any path is under `client/src/vendor/` or any non-sync change is under `server/src/vendor/shared/`, refuse immediately — these are vendored per CLAUDE.md. → [severity.md](severity.md)
3. **Classify and read.** For every changed file, apply the lens set from [classification.md](classification.md). Read the file in full (not via grep snippets) so the lenses see real context.
4. **Run typecheck + tests** for every affected module in parallel. Capture failures.
5. **Aggregate findings.** Assign severity per [severity.md](severity.md). Group by file.
6. **Gate.** If ≥1 finding is `critical`: print the findings, propose concrete fixes, **refuse to run `git push` / `gh pr create`**, and tell the user to fix and re-run `/pr-self-review`.
7. **Otherwise pass.** Print remaining `high`/`medium`/`low` findings (if any) and proceed with the push. The user can still review and amend.

## Reference files

- [classification.md](classification.md) — full path-glob → lens-set table, with rationale per row
- [severity.md](severity.md) — critical / high / medium / low rubric, with concrete examples per lens

## Do-not-touch (from CLAUDE.md)

`client/src/vendor/`, `server/src/vendor/shared/`, and `server/src/db/schema/` follow special rules — this skill's job is to **enforce** those rules, never to relax them.
