// REAL excerpt from server/src/modules/pulls/routes.ts:1-35 (current HEAD) — kept verbatim except
// the `...` truncation markers noted inline. The `pulls` module has NO service.ts and NO
// repository.ts (`ls server/src/modules/pulls/` → only routes.ts, status.ts): every Drizzle query
// for this route runs directly inside the Fastify handler. This is a real, current layering
// violation per the onion-architecture skill's rule "A SQL/Drizzle query" belongs in
// `repository.ts` (infrastructure), and "Routes are thin ... no business logic in routes.ts."

import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { PrMeta, GitHubClient } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
    const { workspaceId } = await getContext(container, req);
    // Drizzle query straight inside the route handler — no service, no repository.
    const [repo] = await container.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
    if (!repo) throw new NotFoundError('Repo not found');

    let gh: GitHubClient | null = null;
    try {
      gh = await container.github();
    } catch (err) {
      app.log.warn({ err }, 'GitHub client unavailable (no token / offline); serving persisted PRs');
    }

    // Another Drizzle query, again straight inside the handler.
    const rows = await container.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.repoId, repo.id));

    const prIds = rows.map((r) => r.id);
    if (prIds.length > 0) {
      // A third Drizzle query with a JOIN and aggregation — business logic (score/cost/findings
      // rollup) computed directly in the route, not in a service.
      const reviewRows = await container.db
        .select({ prId: t.reviews.prId, score: t.reviews.score })
        .from(t.reviews)
        .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
        .orderBy(desc(t.reviews.createdAt));
    }

    return rows as unknown as PrMeta[];
  });
}
