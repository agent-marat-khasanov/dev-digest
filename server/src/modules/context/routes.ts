import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AgentContextLink, ContextList, ContextPreview, SetContextBody, SkillContextLink } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ContextService } from './service.js';

const PreviewBody = z.object({ path: z.string().min(1) });

/**
 * context module (Project Context lesson).
 *   GET  /repos/:id/context           → ContextList (fresh walk; AC-5 → { docs: [], reason: 'not_cloned' })
 *   POST /repos/:id/context/preview   → { path } → ContextPreview
 *   GET  /agents/:id/context          → AgentContextLink[]
 *   POST /agents/:id/context          → SetContextBody → replace ordered set
 *   GET  /skills/:id/context          → SkillContextLink[]
 *   POST /skills/:id/context          → SetContextBody → replace ordered set
 */
export default async function contextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ContextService(app.container);

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: ContextList } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.list(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/context/preview',
    { schema: { params: IdParams, body: PreviewBody, response: { 200: ContextPreview } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.preview(workspaceId, req.params.id, req.body.path);
    },
  );

  app.get(
    '/agents/:id/context',
    { schema: { params: IdParams, response: { 200: z.array(AgentContextLink) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const links = await service.getAgentContext(workspaceId, req.params.id);
      if (!links) throw new NotFoundError('Agent not found');
      return links;
    },
  );

  app.post(
    '/agents/:id/context',
    { schema: { params: IdParams, body: SetContextBody, response: { 200: z.array(AgentContextLink) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const links = await service.setAgentContext(workspaceId, req.params.id, req.body.docs);
      if (!links) throw new NotFoundError('Agent not found');
      return links;
    },
  );

  app.get(
    '/skills/:id/context',
    { schema: { params: IdParams, response: { 200: z.array(SkillContextLink) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const links = await service.getSkillContext(workspaceId, req.params.id);
      if (!links) throw new NotFoundError('Skill not found');
      return links;
    },
  );

  app.post(
    '/skills/:id/context',
    { schema: { params: IdParams, body: SetContextBody, response: { 200: z.array(SkillContextLink) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const links = await service.setSkillContext(workspaceId, req.params.id, req.body.docs);
      if (!links) throw new NotFoundError('Skill not found');
      return links;
    },
  );
}
