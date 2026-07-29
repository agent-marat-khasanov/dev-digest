import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentCase } from "../../src/index.js";
import { REPO_ROOT } from "../../src/index.js";

// `implementation-planner` declares `Write` in its frontmatter, but agentTask strips mutating
// tools (see artifacts/load.ts MUTATING_TOOLS), so it runs read-only here and answers with the
// plan's content directly instead of writing `.ai/plans/<feature>.md` — exactly what a
// content-quality eval needs.
//
// Every input here is a REAL artifact of this repository, read live from disk (never a synthetic
// stand-in): the actual approved spec (`specs/eval-pipeline.md`) and the actual `server/INSIGHTS.md`.
// Reading them live (rather than freezing a copy under fixtures/) means the case always measures
// the planner against whatever the repo's real spec/INSIGHTS currently say.

const SPEC_EVAL_PIPELINE = readFileSync(join(REPO_ROOT, "specs", "eval-pipeline.md"), "utf8");
const SERVER_INSIGHTS = readFileSync(join(REPO_ROOT, "server", "INSIGHTS.md"), "utf8");

export const cases: AgentCase[] = [
  {
    name: "mines the real server/INSIGHTS.md hand-authored-diff gotcha into the plan's Known gotchas section, citing the source",
    kind: "quality",
    prompt: `Plan the implementation of this approved spec. The server module's real INSIGHTS.md is given below as well — mine it for a "Known gotchas" section of your Implementation Plan, citing where each gotcha came from.\n\n## Spec: specs/eval-pipeline.md\n\n${SPEC_EVAL_PIPELINE}\n\n## server/INSIGHTS.md\n\n${SERVER_INSIGHTS}`,
    grounding: ["INSIGHTS"],
    practices: [
      "extracted the hand-authored unified-diff gotcha into a Known gotchas / gotchas section: a fixture's `@@ -a,b +c,d @@` hunk-header counts must match the body's actual context/added/removed line counts, or `parseUnifiedDiff`'s line mapping silently corrupts at eval-run time (there is no validation at seed/insert)",
      "cites server/INSIGHTS.md as the source of this gotcha, not just stating it unattributed",
      "connects the gotcha to the spec's own AC-18 (seeding at least 8 hand-authored demo eval cases with tempting-but-clean decoy diffs), since that is exactly where a hand-authored diff fixture could trip this gotcha",
    ],
    threshold: 0.6,
    maxTurns: 8,
  },
  {
    name: "maps this spec's backend tasks to skills in skill-routing order, architecture skill first",
    kind: "quality",
    prompt: `Plan the implementation of this approved spec. For the task that adds the new nullable \`eval_runs.agent_version\` migration (AC-44/AC-28) AND for the tasks that add the new \`/agents/:id/eval-runs\`-family Fastify routes, list the Required skills in the order the implementer must invoke them.\n\n${SPEC_EVAL_PIPELINE}`,
    grounding: ["agent_version", "eval-runs"],
    practices: [
      "lists onion-architecture as the FIRST required skill for both the migration task and the new-routes task, before any other skill",
      "lists drizzle-orm-patterns and/or postgresql-table-design as a required skill for the new `eval_runs.agent_version` column/migration task",
      "lists fastify-best-practices as a required skill for the new route tasks (the `/agents/:id/eval-runs*` and `/eval-runs` endpoints are new Fastify routes)",
      "the skill order matches the backend skill-routing rule: architecture/placement skill first, then framework skills (drizzle/postgresql/fastify/security as relevant) — never a framework skill listed before the architecture skill",
    ],
    threshold: 0.6,
    maxTurns: 8,
  },
  {
    name: "does not invent a cost threshold or auto-block rule the spec never states — surfaces it as an open question instead",
    kind: "quality",
    prompt: `Plan the implementation of this approved spec, focusing specifically on the run-all cost-estimate-and-confirm step (AC-41, AC-42, AC-43).\n\n${SPEC_EVAL_PIPELINE}`,
    grounding: ["AC-41"],
    practices: [
      "does not invent a specific dollar/token cost threshold above which confirmation becomes mandatory or a run is auto-blocked — AC-41/AC-43 only require an estimate plus an explicit confirmation for EVERY run-all, with no stated numeric cap",
      "does not silently invent an automatic reject/block rule for 'expensive' runs, since the spec never defines what counts as expensive or states any such policy",
      "either surfaces any such threshold/policy as an open question / a follow-up decision, or explicitly notes the spec requires confirm-every-time with no threshold, rather than asserting an invented number as if it were a stated AC",
    ],
    threshold: 0.6,
    maxTurns: 8,
  },
];
