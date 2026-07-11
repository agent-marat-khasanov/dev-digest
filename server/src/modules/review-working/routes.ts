import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Review } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { ReviewWorkingService } from './service.js';

/**
 * Working-tree review module.
 *   POST /review/working  { diff, agent? } → Review
 *
 * Reviews a raw unified diff of the caller's working copy (the `devdigest review
 * --mode working` CLI) with the same product agent + engine used for PRs. The
 * diff is untrusted content — reviewer-core wraps it before prompting; here we
 * cap its size and rate-limit the (LLM-backed) endpoint.
 */
const ReviewWorkingInput = z.object({
  diff: z.string().min(1).max(1_000_000),
  agent: z.string().min(1).optional(),
});

export default async function reviewWorkingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ReviewWorkingService(app.container);

  app.post(
    '/review/working',
    {
      schema: { body: ReviewWorkingInput, response: { 200: Review } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.review(workspaceId, req.body.diff, req.body.agent);
    },
  );
}
