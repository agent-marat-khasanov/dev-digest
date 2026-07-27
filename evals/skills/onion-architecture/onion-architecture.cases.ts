import type { SkillCase } from "../../src/index.js";

// `skillTask` runs content-only (no tools) — it measures the SKILL.md payload in isolation (see
// tasks.ts). So the fixture (a small planted-violation slice of a fake `widgets` module) is inlined
// into the prompt, standing in for what a reviewer would normally open with Read. Each planted
// violation maps to a numbered Hard rule in the skill; the practices below check the review names it.
//
// Seeded starter case — copy this file to add more skills' cases, or run `pnpm eval:scaffold <name>`.

const WIDGETS_SLICE = `\`\`\`ts
// server/src/modules/widgets/service.ts
import { db } from "../../db/client";
import { widgets } from "../../db/schema/widgets";
import { eq } from "drizzle-orm";
import { OpenAIProvider } from "../../adapters/llm/openai";

export class WidgetsService {
  private readonly llm = new OpenAIProvider(process.env.OPENAI_API_KEY!);

  async listForWorkspace(workspaceId: string) {
    // hands the caller Drizzle rows straight out
    return db.select().from(widgets).where(eq(widgets.workspaceId, workspaceId));
  }

  async summarize(id: string) {
    const [row] = await db.select().from(widgets).where(eq(widgets.id, id));
    return this.llm.complete(\`Summarize: \${row.name}\`);
  }
}
\`\`\`

\`\`\`ts
// server/src/modules/widgets/routes.ts
import type { FastifyInstance } from "fastify";
import { WidgetsService } from "./service";

export async function widgetsRoutes(app: FastifyInstance) {
  const service = new WidgetsService();
  app.get("/widgets", async (req, reply) => {
    const rows = await service.listForWorkspace((req.user as any).workspaceId);
    // ownership + visibility filtering, then row -> DTO shaping, inline in the route
    const visible = rows.filter(
      (r) => r.deletedAt === null && (r.ownerId === (req.user as any).id || r.shared),
    );
    return reply.send(visible.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt })));
  });
}
\`\`\``;

export const cases: SkillCase[] = [
  {
    name: "review flags widgets-module layering & dependency-rule violations",
    kind: "quality",
    prompt: `Review this proposed \`widgets\` module strictly for onion-architecture / layering violations. Report each violation as a concrete finding that names the file and the rule it breaks; do not rewrite the code.\n\n${WIDGETS_SLICE}`,
    grounding: ["service.ts"],
    practices: [
      "flagged that service.ts runs a Drizzle/SQL query directly (db.select().from(widgets)) — a database query belongs in the module's repository.ts (infrastructure), not in the service (application layer)",
      "flagged that the service constructs an external client itself (new OpenAIProvider) instead of receiving the LLM as an injected port resolved from the Container",
      "flagged that raw Drizzle rows cross the service->route boundary and the row-to-DTO mapping is done inline in the route instead of in helpers.ts (map at the boundary)",
      "flagged that the route handler contains business logic (ownership/visibility filtering) instead of staying thin and delegating to the service",
    ],
    threshold: 0.6,
    maxTurns: 6,
  },
];
