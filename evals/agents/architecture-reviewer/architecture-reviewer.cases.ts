import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

// The fixtures are inlined into the prompt (mirrors skills/onion-architecture's pattern) so the
// review target is fixed and reproducible, rather than depending on agentTask's live-repo tool
// access. Each fixture is a synthetic module standing in for a real server module.

const fx = fixtureReader(import.meta.url);
const ROUTES_VIOLATION = fx("routes-violation.ts");
const SERVICE_GOOD = fx("service-good.ts");
const PERF_NAMING = fx("perf-naming.ts");

export const cases: AgentCase[] = [
  {
    name: "flags the Drizzle query directly in routes.ts as a layering violation",
    kind: "quality",
    prompt: `Review this proposed \`invoices\` module file for architectural issues.\n\n\`\`\`ts\n${ROUTES_VIOLATION}\n\`\`\``,
    grounding: ["routes.ts", "invoices"],
    practices: [
      "flagged as CRITICAL that the route handler runs a Drizzle query directly (db.select().from(invoices)) instead of delegating to a repository/service — a presentation-layer file doing infrastructure work",
      "identified the concrete mechanism: the route imports `db` and the `invoices` schema directly, which breaks the dependency rule (presentation depending on infrastructure with no application-layer indirection)",
      "gave a verdict of request_changes (or equivalent language indicating the change should not be merged as-is), consistent with a CRITICAL finding",
    ],
    threshold: 0.6,
    maxTurns: 8,
  },
  {
    name: "DECOY — stays silent on a correctly-layered service that depends only on injected ports",
    kind: "quality",
    prompt: `Review this proposed \`notifications\` module file for architectural issues.\n\n\`\`\`ts\n${SERVICE_GOOD}\n\`\`\``,
    grounding: ["NotificationsService"],
    practices: [
      "does NOT report any CRITICAL or WARNING layering violation for this file",
      "explicitly notes (or its verdict/findings imply) that the service depends only on injected port interfaces (NotificationRepository, NotifierPort) and constructs no concrete adapter itself, i.e. approve or empty findings",
      "does not invent a fabricated issue (e.g. does not claim the service imports Drizzle or a concrete adapter, which it does not)",
    ],
    threshold: 0.6,
    maxTurns: 8,
  },
  {
    name: "does not comment on naming, style, or performance — only architecture",
    kind: "quality",
    prompt: `Review this proposed \`tags\` module file for architectural issues.\n\n\`\`\`ts\n${PERF_NAMING}\n\`\`\``,
    grounding: ["TagsService"],
    practices: [
      "does not flag the poor variable names (e.g. `x`, `d`) as an issue — naming/style is out of scope for this reviewer",
      "does not flag the nested O(n^2) loop as a performance problem — performance is out of scope for this reviewer",
      "either reports no violation for this file (layering is correct: TagsService depends only on the injected TagsRepository port) or, if it comments at all, stays confined to architecture/layering",
    ],
    threshold: 0.6,
    maxTurns: 8,
  },
];
