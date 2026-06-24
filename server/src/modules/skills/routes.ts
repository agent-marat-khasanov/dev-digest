import { Buffer } from 'node:buffer';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateSkillInput,
  UpdateSkillInput,
  SkillListQuery,
  SkillType,
} from '@devdigest/shared';
import type { SkillType as SkillTypeT } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { SkillsService } from './service.js';
import { parseSkillUpload } from './import.js';

/**
 * Skills module (lesson: reusable skills bound to agents).
 *   GET    /skills                  → list (workspace-scoped, type/enabled filter)
 *   GET    /skills/:id              → one skill
 *   POST   /skills                  → create (source defaults to 'manual')
 *   PUT    /skills/:id              → update; body change snapshots a version
 *   DELETE /skills/:id              → delete (cascades agent_skills links)
 *   GET    /skills/:id/versions     → body history (newest first)
 *   POST   /skills/import/preview   → parse upload, return preview (no DB write)
 *
 * The agent ↔ skill binding endpoints live in the agents module
 * (`POST /agents/:id/skills`). This module never writes to `agent_skills`.
 */

const ImportPreviewBody = z.object({
  filename: z.string().min(1).max(256),
  /** Base64-encoded file bytes. Server enforces size + format limits. */
  content_base64: z.string().min(1),
});

const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

const CommunityQuery = z.object({
  q: z.string().optional(),
  lang: z.string().optional(),
});

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', { schema: { querystring: SkillListQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const q = req.query;
    return service.list(workspaceId, {
      ...(q.type !== undefined ? { type: q.type as z.infer<typeof SkillType> } : {}),
      ...(q.enabled !== undefined ? { enabled: q.enabled } : {}),
    });
  });

  // Community catalogue is read-only + workspace-agnostic (no DB lookup), but
  // the workspace context is still resolved so unauthenticated callers fail
  // at the edge the same way the rest of the module does.
  app.get('/skills/community', { schema: { querystring: CommunityQuery } }, async (req) => {
    await getContext(app.container, req);
    return service.listCommunity({
      ...(req.query.q !== undefined ? { q: req.query.q } : {}),
      ...(req.query.lang !== undefined ? { lang: req.query.lang } : {}),
    });
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillInput } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const body = req.body;
    const skill = await service.create(workspaceId, {
      name: body.name,
      description: body.description,
      type: body.type,
      body: body.body,
      ...(body.source !== undefined ? { source: body.source } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.evidence_files !== undefined ? { evidence_files: body.evidence_files } : {}),
    });
    reply.status(201);
    return skill;
  });

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.update(workspaceId, req.params.id, req.body);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const stats = await service.getStats(workspaceId, req.params.id);
    if (!stats) throw new NotFoundError('Skill not found');
    return stats;
  });

  app.get(
    '/skills/:id/versions/:version/diff',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const diff = await service.getVersionDiff(workspaceId, req.params.id, req.params.version);
      if (!diff) throw new NotFoundError('Skill version not found');
      return diff;
    },
  );

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restoreVersion(workspaceId, req.params.id, req.params.version);
      if (!skill) throw new NotFoundError('Skill version not found');
      return skill;
    },
  );

  app.post(
    '/skills/import/preview',
    { schema: { body: ImportPreviewBody } },
    async (req) => {
      await getContext(app.container, req);
      const { filename, content_base64 } = req.body;
      const bytes = decodeBase64(content_base64);
      return parseSkillUpload({ filename, bytes });
    },
  );
}

function decodeBase64(input: string): Buffer {
  try {
    return Buffer.from(input, 'base64');
  } catch {
    throw new ValidationError('content_base64 is not valid base64');
  }
}
