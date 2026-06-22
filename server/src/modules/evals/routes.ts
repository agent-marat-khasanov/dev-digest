import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { EvalsService } from './service.js';

/**
 * Evals module (lesson: run a skill against gold eval cases).
 *   GET    /skills/:id/evals              → eval cases + latest-run summary
 *   POST   /skills/:id/evals/run          → run every case (real LLM) → summaries
 *   POST   /skills/:id/evals/:caseId/run  → run one case (real LLM) → summary
 *   DELETE /skills/:id/evals/:caseId      → delete a case
 *
 * Cases are created via the DB seed for now — there is no create/edit route yet.
 * A run executes the skill through @devdigest/reviewer-core and scores the
 * findings against the case's expected output (see EvalsService).
 */

const CaseParams = z.object({ id: z.string().uuid(), caseId: z.string().uuid() });

export default async function evalsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new EvalsService(app.container);

  app.get('/skills/:id/evals', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listSummaries(workspaceId, req.params.id);
  });

  app.post('/skills/:id/evals/run', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.runAll(workspaceId, req.params.id);
  });

  app.post('/skills/:id/evals/:caseId/run', { schema: { params: CaseParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.runCase(workspaceId, req.params.id, req.params.caseId);
  });

  app.delete('/skills/:id/evals/:caseId', { schema: { params: CaseParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.deleteCase(workspaceId, req.params.id, req.params.caseId);
    if (!ok) throw new NotFoundError('Eval case not found');
    return { ok: true };
  });
}
