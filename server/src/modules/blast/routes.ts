import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadius } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

/**
 * Blast module.
 *   GET /pulls/:id/blast → PR impact map: changed symbols → downstream callers
 *   (file:line) → reachable HTTP endpoints / crons.
 *
 * Reads the repo-intel index ONLY — no LLM, no parsing. Thin route: validate
 * params → getContext → service → serialise the shared BlastRadius contract.
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BlastService(app.container);

  app.get(
    '/pulls/:id/blast',
    {
      schema: {
        params: IdParams,
        response: { 200: BlastRadius },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getBlast(workspaceId, req.params.id);
    },
  );
}
