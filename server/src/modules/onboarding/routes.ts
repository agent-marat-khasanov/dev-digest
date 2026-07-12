import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { OnboardingTour } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { OnboardingService } from './service.js';

/**
 * Onboarding tour module.
 *   GET  /repos/:id/tour              → cached-if-fresh, generate-if-stale, return OnboardingTour
 *   POST /repos/:id/tour/regenerate   → force regenerate (cache bypass), return OnboardingTour
 *
 * Thin route: validate params → getContext → service → serialise. Route param
 * is the repoId (mirrors `GET /repos/:id/context`) — the workspace-scoped
 * lookup happens inside the service via `container.repoRepo.getById` (AC-22).
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new OnboardingService(app.container);

  app.get(
    '/repos/:id/tour',
    {
      schema: {
        params: IdParams,
        response: { 200: OnboardingTour },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getTour(workspaceId, req.params.id, req.log);
    },
  );

  // Tight per-route limit: each call forces an LLM generation (cache bypass).
  app.post(
    '/repos/:id/tour/regenerate',
    {
      schema: {
        params: IdParams,
        response: { 200: OnboardingTour },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.regenerate(workspaceId, req.params.id, req.log);
    },
  );
}
