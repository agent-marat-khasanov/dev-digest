import type { SkillCase } from "../../src/index.js";

// `skillTask` runs content-only (no tools) — it measures the SKILL.md payload in isolation (see
// tasks.ts). The dependency-checker normally gathers this itself with Read/Bash/Grep, so each prompt
// inlines a small dataset "already collected" for the model to reason over directly. Numbers are
// grounded in this repo's real packages; two issues are planted to make the case discriminating:
//   - zod version drift (client 3.22.4 vs 3.23.8 elsewhere),
//   - an unused dependency (moment, declared in server, imported nowhere),
//   - an internal-import violation (server reaching reviewer-core/src by relative path, not the alias).

const REPO_DATA = `Here is the data you'd normally gather yourself — treat it as already collected, and produce the report directly from it (do not ask for tool access or more data).

package.json dependencies (runtime), per package:
- server/package.json  (@devdigest/api):        fastify@5.1.0, drizzle-orm@0.36.0, postgres@3.4.5, zod@3.23.8, openai@4.77.0, octokit@4.0.2, dependency-cruiser@16.4.0, js-tiktoken@1.0.15, moment@2.30.1
- client/package.json  (@devdigest/web):         next@15.0.3, react@19.0.0, react-dom@19.0.0, @tanstack/react-query@5.59.0, mermaid@11.4.0, recharts@2.13.0, zod@3.22.4
- reviewer-core/package.json (@devdigest/reviewer-core): openai@4.77.0, zod@3.23.8
- mcp/package.json     (@devdigest/mcp):          @modelcontextprotocol/sdk@1.0.4, zod@3.23.8
- e2e/package.json     (@devdigest/e2e):          (no runtime dependencies)
- evals/package.json   (@devdigest/evals):        @anthropic-ai/claude-agent-sdk@0.3.198, openai@4.104.0   (dev-only harness)

devDependencies of note: typescript@5.6.3 in server, typescript@5.9.3 in client (version differs), vitest in server+client+evals, playwright@1.48.2 in e2e.

Internal wiring (this repo is NOT a monorepo — no workspace:* — internal deps are tsconfig path aliases + relative imports):
- @devdigest/shared  -> server/src/vendor/shared   (imported by server, client, reviewer-core, mcp)
- @devdigest/reviewer-core -> reviewer-core/src     (imported by server)
- @devdigest/ui      -> client/src/vendor/ui        (client-internal only)
- @/*, @messages/*                                   (client-internal only)

grep across src/ for boundary-crossing imports:
- server/src/modules/reviews/service.ts imports "../../../reviewer-core/src/review/run.js" by RELATIVE path (not via the @devdigest/reviewer-core alias / public entry point)
- client/src/lib/api-types.ts imports "@devdigest/shared" (alias)
- reviewer-core/src/review/run.ts imports "@devdigest/shared" (alias)
- grep found NO import of "moment" anywhere under server/src — it is only in server/package.json

Installed sizes (du -sh <package>/node_modules and heaviest deps):
- client/node_modules: 645M   (next 132M, mermaid 41M, recharts 6M, react-dom 6.9M, zod 1.9M)
- server/node_modules: 244M   (dependency-cruiser 24M, drizzle-orm 8.1M, fastify 6.5M, openai 5.2M, zod 2.1M)
- reviewer-core/node_modules: 163M  (openai 5.2M, zod 2.1M — the rest is dev tooling)
- mcp/node_modules: 86M
- e2e/node_modules: NOT INSTALLED
- three different resolved zod versions declared: server 3.23.8, client 3.22.4, reviewer-core 3.23.8, mcp 3.23.8`;

export const cases: SkillCase[] = [
  {
    name: "full report follows the required 5-section structure with a Mermaid graph",
    kind: "quality",
    prompt: `Run a dependency check on this repo. I want the full report: graph, sizes, prioritized findings, recommendations.\n\n${REPO_DATA}`,
    grounding: ["```mermaid", "flowchart"],
    practices: [
      "the report opens with a 'Scope' section naming which packages were analyzed (server, client, reviewer-core, mcp, e2e, evals) and notes e2e as skipped because its node_modules is not installed",
      "the report includes a Mermaid diagram (a fenced ```mermaid block using flowchart) showing the package dependency relationships, with @devdigest/shared as a common dependency",
      "the report has a size-breakdown section with an installed-size table (concrete sizes like 645M / 132M), not a vague statement, and calls out the repo-wide largest footprint (client) and largest single dependency (next)",
      "the report has a 'Findings & Priorities' section that groups findings under explicit tiers P0, P1, P2, and Info — not an unranked bullet list",
      "the report ends with a Summary of 3-5 concrete, actionable takeaways ordered by priority",
      "every finding names a specific package, dependency, or file rather than giving generic advice like 'consider optimizing dependencies'",
    ],
    threshold: 0.7,
    maxTurns: 10,
  },
  {
    name: "separates internal alias deps from external npm deps and catches drift / unused / internal-leak",
    kind: "quality",
    prompt: `Analyze our dependencies, including how the packages depend on each other internally, and tell me what to prioritize fixing first.\n\n${REPO_DATA}`,
    practices: [
      "the answer explicitly distinguishes internal cross-package dependencies (the @devdigest/shared and @devdigest/reviewer-core path aliases) from external npm dependencies, rather than treating them as the same kind of dependency",
      "the answer flags server/src/modules/reviews/service.ts importing reviewer-core/src by relative path instead of through the @devdigest/reviewer-core alias / public entry point, and rates it P0",
      "the answer does not claim the packages are linked via workspace:* or pnpm workspaces, since the repo explicitly is not a monorepo",
      "the answer flags the zod version drift (client 3.22.4 vs 3.23.8 in server/reviewer-core/mcp) as a P1 finding",
      "the answer flags moment, declared in server/package.json but never imported under server/src, as an unused dependency",
      "removing a dependency or aligning a version is presented as a recommendation for the user to confirm, not something already executed",
    ],
    threshold: 0.6,
    maxTurns: 10,
  },
];
