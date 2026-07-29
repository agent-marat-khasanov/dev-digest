// Synthetic fixture module for architecture-reviewer evals — NOT part of the real DevDigest codebase.
// server/src/modules/invoices/routes.ts — a route handler that queries Drizzle directly, bypassing
// the module's repository/service layers entirely.

import type { FastifyInstance } from "fastify";
import { db } from "../../db/client";
import { invoices } from "../../db/schema/invoices";
import { eq } from "drizzle-orm";

export async function invoicesRoutes(app: FastifyInstance) {
  app.get("/invoices/:workspaceId", async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    // Drizzle query straight inside the route handler — no service, no repository.
    const rows = await db.select().from(invoices).where(eq(invoices.workspaceId, workspaceId));
    return reply.send(rows);
  });
}
