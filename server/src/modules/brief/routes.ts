import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Brief } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BriefService } from './service.js';

/**
 * Brief module.
 *   POST /pulls/:id/brief              → cached-if-fresh, generate-if-stale, return Brief
 *   POST /pulls/:id/brief/regenerate   → force regenerate (cache bypass), return Brief
 *
 * Thin route: validate params → getContext → service → serialise.
 * LLM/provider errors propagate as 5xx; the client card degrades to EmptyState (AC-16).
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BriefService(app.container);

  app.post(
    '/pulls/:id/brief',
    {
      schema: {
        params: IdParams,
        response: { 200: Brief },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getBrief(workspaceId, req.params.id, req.log);
    },
  );

  app.post(
    '/pulls/:id/brief/regenerate',
    {
      schema: {
        params: IdParams,
        response: { 200: Brief },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.regenerate(workspaceId, req.params.id, req.log);
    },
  );
}
