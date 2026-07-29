---
name: dependency-checker
description: "Audits DevDigest's dependencies — external npm packages per package.json AND internal cross-package dependencies (TypeScript path aliases, since this repo is NOT a monorepo) — across every package (server, client, reviewer-core, mcp, e2e, evals, plus the shared/ui alias packages). Produces a Mermaid dependency graph, an installed-size breakdown per package, and a prioritized P0/P1/P2/Info findings list with concrete, actionable recommendations. Invoke when the user asks to audit dependencies, map what-depends-on-what, check package/bundle size or weight, find unused / duplicate / drifting / circular dependencies, or wants a 'dependency report' / 'dependency graph' / 'dependency map'. Trigger phrases: dependency checker, dependency audit, dependency graph, package size, bundle size, unused dependency, duplicate dependency, version drift, circular dependency, what depends on X."
---

# Dependency Checker

Audit dependencies at **two levels** and produce **one structured report**:

- **External** — npm packages declared in each `package.json` (`dependencies` + `devDependencies`).
- **Internal** — cross-package imports via **TypeScript path aliases** and boundary-crossing relative imports. This repo is **not** a monorepo (no `workspace:*`, no root lockfile) — internal deps are aliases, not linked packages. **Never conflate the two** in the graph or the tables.

> **Contract:** always run all four steps and emit all five report sections, in order. A graph
> with no prioritization, or findings with no severity, is an incomplete report. When a package
> cannot be sized (no `node_modules`), say so — never guess a number.

## Scope — packages in this repo

Discover packages **fresh each run** (don't trust a stale list — packages get added):

```bash
find . -name package.json \
  -not -path '*/node_modules/*' -not -path '*/.next/*' \
  -not -path '*/.claude/*' -not -path '*/clones/*' -not -path '*/worktrees/*' | sort
```

Expected baseline (at time of writing):

| Package | Path | `package.json` | Notes |
|---|---|---|---|
| `@devdigest/api` | `server/` | yes | Fastify API + repo-intel indexer; the largest dependency count |
| `@devdigest/web` | `client/` | yes | Next.js UI; by far the heaviest `node_modules` |
| `@devdigest/reviewer-core` | `reviewer-core/` | yes | the **pure core** — must stay lean (only `openai`, `zod`) |
| `@devdigest/mcp` | `mcp/` | yes | local MCP server |
| `@devdigest/e2e` | `e2e/` | yes | Playwright flows (no runtime deps) |
| `@devdigest/evals` | `evals/` | yes | dev-only eval harness (vitest + Claude Agent SDK) |
| `@devdigest/shared` | `server/src/vendor/shared/` | **alias only** | Zod contracts + adapter ports, mirrored across packages |
| `@devdigest/ui` | `client/src/vendor/ui/` | **alias only** | vendored UI kit (client-internal) |

Internal alias map (`tsconfig.json` `paths`): `@devdigest/shared` → used by server, client, reviewer-core, mcp · `@devdigest/reviewer-core` → used by server · `@devdigest/ui`, `@/*`, `@messages/*` → client-internal only.

## The four steps

| Step | What it does | Reference |
|---|---|---|
| 1. **Discover** | enumerate external deps (+ version drift) and internal cross-package edges | [discovery.md](discovery.md) |
| 2. **Graph** | one Mermaid `flowchart` — packages, internal edges, large/shared external nodes | [graph.md](graph.md) |
| 3. **Size** | installed size of the heaviest deps, per package, + repo-wide total | [sizing.md](sizing.md) |
| 4. **Prioritize** | classify every finding P0/P1/P2/Info, give concrete recommendations | [prioritization.md](prioritization.md) |

## Output Report — fixed structure

Emit exactly these five sections, in this order, with these headings:

1. **Scope** — packages analyzed; any skipped, with the reason (e.g. `e2e` — `node_modules` not installed).
2. **Dependency Graph** — the Mermaid diagram from Step 2.
3. **Size Breakdown** — per-package tables + the repo-wide total + the single largest dependency.
4. **Findings & Priorities** — grouped P0 → P1 → P2 → Info; each finding names a package/file, the reason, and **one** concrete recommendation.
5. **Summary** — 3–5 takeaways a developer can act on today, ordered by tier.

Never omit a section — write "none found" so the report reads complete, not truncated.

## Guardrails

- **Analyze only.** Never install, remove, or update a dependency. A fix that removes or force-resolves a package is a **recommendation to confirm with the user**, not an action.
- **No guessed CVEs.** Only flag a vulnerability if you actually ran `pnpm audit` for that package — cite the output. Never invent a CVE or severity.
- **Internal ≠ external.** Keep alias / relative cross-package deps separate from npm deps in both the graph and the tables.
- **`reviewer-core` stays pure.** It is the exemplar pure core (`onion-architecture`). Any heavy or I/O dependency added there is a notable finding, not routine.

## Related skills

| Skill | Covers (NOT this skill) |
|---|---|
| `mermaid-diagram` | Mermaid syntax details / diagram types beyond the flowchart used here |
| `onion-architecture` | import-direction rules *within* `server/` (intra-module layering), not cross-*package* dependencies |
