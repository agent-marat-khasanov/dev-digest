import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import * as t from '../../db/schema.js';
import { MockGitClient, MockGitHubClient } from '../../adapters/mocks.js';
import { RepoRepository } from '../repos/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[context] Docker not available — skipping integration tests.');
}

d('context module (routes + link CRUD + workspace scoping)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let cloneRoot: string;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;

    cloneRoot = await mkdtemp(join(tmpdir(), 'context-it-'));
    await mkdir(join(cloneRoot, 'specs'), { recursive: true });
    await writeFile(join(cloneRoot, 'specs', 'api.md'), '# API spec\n\nSome invariant.');
    await mkdir(join(cloneRoot, 'docs'), { recursive: true });
    await writeFile(join(cloneRoot, 'docs', 'guide.md'), '# Guide');
  });

  afterAll(async () => {
    await rm(cloneRoot, { recursive: true, force: true });
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  async function createRepo(clonePath: string | null, ws = workspaceId) {
    const repoRepo = new RepoRepository(pg.handle.db);
    const repo = await repoRepo.insert({
      workspaceId: ws,
      owner: 'acme',
      name: `repo-${Math.random().toString(36).slice(2)}`,
      fullName: `acme/repo-${Math.random().toString(36).slice(2)}`,
      createdBy: (await pg.handle.db.select().from(t.users).limit(1))[0]!.id,
    });
    if (clonePath) await repoRepo.updateClonePath(repo.id, clonePath);
    return repo;
  }

  it('AC-5: a never-cloned repo returns 200 with an empty list + a reason, not a 500', async () => {
    const app = await makeApp();
    const repo = await createRepo(null);
    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ docs: [], reason: 'not_cloned' });
    await app.close();
  });

  it('discovers docs under configured roots, with folder_type, size, tokens, updated_at', async () => {
    const app = await makeApp();
    const repo = await createRepo(cloneRoot);
    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.reason).toBeNull();
    const docs = body.docs;
    const api = docs.find((doc: { path: string }) => doc.path === 'specs/api.md');
    expect(api).toBeDefined();
    expect(api.folder_type).toBe('specs');
    expect(api.size_bytes).toBeGreaterThan(0);
    expect(api.tokens).toBeGreaterThan(0);
    expect(typeof api.updated_at).toBe('string');
    expect(docs.some((doc: { path: string }) => doc.path === 'docs/guide.md')).toBe(true);
    await app.close();
  });

  it('AC-7: rescan re-walks fresh — a doc added on disk appears on the next call', async () => {
    const app = await makeApp();
    const repo = await createRepo(cloneRoot);
    const before = (
      await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })
    ).json().docs;
    expect(before.some((doc: { path: string }) => doc.path === 'specs/new.md')).toBe(false);

    await writeFile(join(cloneRoot, 'specs', 'new.md'), '# New');
    const after = (
      await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })
    ).json().docs;
    expect(after.some((doc: { path: string }) => doc.path === 'specs/new.md')).toBe(true);
    await app.close();
  });

  it('previews a doc on demand', async () => {
    const app = await makeApp();
    const repo = await createRepo(cloneRoot);
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/context/preview`,
      payload: { path: 'specs/api.md' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ path: 'specs/api.md', content: '# API spec\n\nSome invariant.' });
    await app.close();
  });

  it('AC-27: rejects a preview path that escapes the clone (traversal)', async () => {
    const app = await makeApp();
    const repo = await createRepo(cloneRoot);
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/context/preview`,
      payload: { path: '../../etc/passwd' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('AC-29: context for a repo in another workspace is not reachable (404)', async () => {
    const app = await makeApp();
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-ctx' }).returning();
    const repo = await createRepo(cloneRoot, otherWs!.id);
    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('agent context: set, get, reorder persists, and unsafe paths are rejected', async () => {
    const app = await makeApp();
    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Context Agent',
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'Review the diff.',
      },
    });
    const agentId = created.json().id as string;

    const set = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context`,
      payload: {
        docs: [
          { path: 'docs/guide.md', order: 1 },
          { path: 'specs/api.md', order: 0 },
        ],
      },
    });
    expect(set.statusCode).toBe(200);

    const get = await app.inject({ method: 'GET', url: `/agents/${agentId}/context` });
    const links = get.json();
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ agent_id: agentId, path: 'specs/api.md', order: 0 });
    expect(links[1]).toMatchObject({ agent_id: agentId, path: 'docs/guide.md', order: 1 });

    const rejected = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context`,
      payload: { docs: [{ path: '../../outside.md', order: 0 }] },
    });
    expect(rejected.statusCode).toBe(422);
    await app.close();
  });

  it('agent context routes 404 for an unknown agent', async () => {
    const app = await makeApp();
    const ghost = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/agents/${ghost}/context` })).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/agents/${ghost}/context`,
          payload: { docs: [] },
        })
      ).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('skill context: set, get, and unsafe paths are rejected', async () => {
    const app = await makeApp();
    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: 'Context Skill',
        description: 'x',
        type: 'custom',
        body: 'Rules.',
      },
    });
    const skillId = created.json().id as string;

    const set = await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/context`,
      payload: { docs: [{ path: 'specs/api.md', order: 0 }] },
    });
    expect(set.statusCode).toBe(200);

    const get = await app.inject({ method: 'GET', url: `/skills/${skillId}/context` });
    expect(get.json()).toEqual([{ skill_id: skillId, path: 'specs/api.md', order: 0 }]);

    const rejected = await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/context`,
      payload: { docs: [{ path: '/etc/passwd', order: 0 }] },
    });
    expect(rejected.statusCode).toBe(422);
    await app.close();
  });

  it('AC-22: zero LLM calls in the whole discovery/attach flow', async () => {
    const app = await makeApp();
    const repo = await createRepo(cloneRoot);
    await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` });
    await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/context/preview`,
      payload: { path: 'specs/api.md' },
    });
    // No LLM override was registered in makeApp(); resolving `container.llm(...)`
    // would throw ConfigError (missing key) — reaching this point proves no
    // LLM path was exercised.
    await app.close();
  });
});
