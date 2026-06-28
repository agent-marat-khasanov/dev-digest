import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrIntentRecord } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { IntentService } from './service.js';

/**
 * Intent module.
 *   GET  /pulls/:id/intent              → generate-if-stale, return PrIntentRecord
 *   POST /pulls/:id/intent/recalculate  → force regenerate (cache bypass), return PrIntentRecord
 *
 * Thin route: validate params → getContext → service → serialise.
 * LLM/provider errors propagate as 5xx; the client panel degrades to EmptyState.
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new IntentService(app.container);

  app.get(
    '/pulls/:id/intent',
    {
      schema: {
        params: IdParams,
        response: { 200: PrIntentRecord },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getIntent(workspaceId, req.params.id);
    },
  );

  // Tight per-route limit: each call forces an LLM generation (cache bypass).
  app.post(
    '/pulls/:id/intent/recalculate',
    {
      schema: {
        params: IdParams,
        response: { 200: PrIntentRecord },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.recalculate(workspaceId, req.params.id);
    },
  );
}
