import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { RepoInput, RepoFileContent, RepoStats } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { RepoService } from './service.js';

/** Query for the in-app file viewer: the repo-relative path to read. */
const FileQuery = z.object({ path: z.string().min(1) });

/** `/repos/:repoId/stats` names its param `repoId` (the rollup is repo-scoped). */
const RepoIdParams = z.object({ repoId: z.string().uuid() });

/**
 * F1 — repos module. Transport layer only: parses requests, maps status
 * codes, and delegates all business logic to RepoService.
 *   POST   /repos              → add repo (parse URL, persist, enqueue real clone)
 *   GET    /repos              → list repos (workspace-scoped)
 *   GET    /repos/:repoId/stats → 30-day activity rollup (runs, findings, severities)
 *   POST   /repos/:id/refresh  → re-fetch clone + bump last_polled_at
 *   DELETE /repos/:id          → remove repo
 *
 * The clone runs as a JobRunner job (kind 'clone') — real `git clone` via the
 * GitClient adapter into <cloneDir>/<owner>/<repo>.
 */
export default async function reposRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new RepoService(app.container);

  // Register the clone job handler once.
  service.registerCloneJobHandler();

  app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    const { repo, created } = await service.add(workspaceId, userId, req.body.url);
    reply.status(created ? 201 : 200);
    return repo;
  });

  app.get('/repos', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get(
    '/repos/:repoId/stats',
    { schema: { params: RepoIdParams, response: { 200: RepoStats } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.stats(workspaceId, req.params.repoId);
    },
  );

  app.get(
    '/repos/:id/file',
    { schema: { params: IdParams, querystring: FileQuery, response: { 200: RepoFileContent } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.readFileContent(workspaceId, req.params.id, req.query.path);
    },
  );

  app.post('/repos/:id/refresh', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.refresh(workspaceId, req.params.id);
  });

  app.delete('/repos/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.remove(workspaceId, req.params.id);
    return { deleted: req.params.id };
  });
}
