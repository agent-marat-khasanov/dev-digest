import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ConventionListQuery,
  CreateSkillFromConventionsInput,
  UpdateConventionInput,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module (lesson: extract house-rules from a repo and bake the
 * accepted ones into a Skill).
 *   POST   /repos/:id/conventions/extract  → scan repo → model → validate → persist
 *   GET    /repos/:id/conventions          → list (optional ?status= filter)
 *   PATCH  /conventions/:id                → accept/reject or edit rule/category/evidence
 *   DELETE /conventions/:id                → delete one
 *   POST   /conventions/create-skill       → create a Skill from accepted conventions
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.extract(workspaceId, req.params.id);
  });

  app.get(
    '/repos/:id/conventions',
    { schema: { params: IdParams, querystring: ConventionListQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listByRepo(workspaceId, req.params.id, req.query.status);
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.update(workspaceId, req.params.id, req.body);
    },
  );

  app.delete('/conventions/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.remove(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Convention not found');
    return { ok: true };
  });

  app.post(
    '/conventions/create-skill',
    { schema: { body: CreateSkillFromConventionsInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.createSkillFromConventions(workspaceId, req.body);
      reply.status(201);
      return skill;
    },
  );
}
