import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

// The fixtures are inlined into the prompt (mirrors skills/onion-architecture's pattern) so the
// review target is fixed and reproducible, rather than depending on agentTask's live-repo tool
// access. Every fixture here is a REAL excerpt of this repository's own code — no synthetic
// stand-ins — per the project rule that eval cases must be grounded in collected data, not
// invented. See each fixture file's header comment for the exact source (path:line / commit).

const fx = fixtureReader(import.meta.url);
const ROUTES_VIOLATION = fx("routes-violation.ts");
const SERVICE_GOOD = fx("service-good.ts");
const PERF_NAMING = fx("perf-naming.ts");

export const cases: AgentCase[] = [
  {
    name: "flags the Drizzle queries directly in pulls/routes.ts as a real layering violation",
    kind: "quality",
    prompt: `Review this excerpt of the real \`pulls\` module's routes.ts for architectural issues.\n\n\`\`\`ts\n${ROUTES_VIOLATION}\n\`\`\``,
    grounding: ["routes.ts", "pulls"],
    practices: [
      "flagged as CRITICAL (or WARNING) that the route handler runs Drizzle queries directly (container.db.select(...)) instead of delegating to a repository/service — a presentation-layer file doing infrastructure work",
      "identified the concrete mechanism: the route imports the db schema (`t`) and calls `container.db` directly, with no repository.ts or service.ts in the module to hold that logic",
      "gave a verdict of request_changes (or equivalent language indicating the change should not be merged as-is), consistent with a CRITICAL/WARNING layering finding",
    ],
    threshold: 0.6,
    maxTurns: 8,
  },
  {
    name: "DECOY — recognizes the real, deliberately-recorded exception for importing parseUnifiedDiff",
    kind: "quality",
    prompt: `Review this excerpt of the real \`evals\` module's service.ts for architectural issues.\n\n\`\`\`ts\n${SERVICE_GOOD}\n\`\`\``,
    grounding: ["EvalsService", "parseUnifiedDiff"],
    practices: [
      "does NOT report a CRITICAL or WARNING layering violation for EvalsService importing parseUnifiedDiff directly from the adapters/git module",
      "correctly reasons (or its verdict/findings imply) that parseUnifiedDiff performs zero I/O — it's a pure function, not an I/O-performing adapter — so a service may import it directly without breaking the dependency rule",
      "does not invent a fabricated issue elsewhere in the file (e.g. does not claim the service constructs a concrete LLM adapter itself, which it does not — it resolves one from the injected container)",
    ],
    threshold: 0.6,
    maxTurns: 8,
  },
  {
    name: "does not comment on naming, style, or performance — only architecture",
    kind: "quality",
    prompt: `Review this real file for architectural issues.\n\n\`\`\`ts\n${PERF_NAMING}\n\`\`\``,
    grounding: ["scoreEval"],
    practices: [
      "does not flag the short variable names (e.g. `e`, `a`, `i`) as an issue — naming/style is out of scope for this reviewer",
      "does not flag the nested double for-loop in scoreEval as a performance problem — performance is out of scope for this reviewer",
      "either reports no violation for this file (layering is correct: a pure, I/O-free scorer has nothing to violate the dependency rule with) or, if it comments at all, stays confined to architecture/layering",
    ],
    threshold: 0.6,
    maxTurns: 8,
  },
];
