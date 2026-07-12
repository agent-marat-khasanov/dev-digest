import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { waitForPrRuns } from '../../../test/helpers/runs.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../../adapters/mocks.js';
import { RepoRepository } from '../repos/repository.js';
import * as t from '../../db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'approve',
  summary: 'Looks fine.',
  score: 90,
  findings: [],
};

d('T6 project-context run-time injection (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let cloneRoot: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    cloneRoot = await mkdtemp(join(tmpdir(), 'context-injection-it-'));
    await mkdir(join(cloneRoot, 'specs'), { recursive: true });
    await writeFile(join(cloneRoot, 'specs', 'security-baseline.md'), '# Security baseline\n\nNever hardcode secrets.');
    await mkdir(join(cloneRoot, 'docs'), { recursive: true });
    await writeFile(join(cloneRoot, 'docs', 'public-api.md'), '# Public API\n\nStable contract.');
  });

  afterAll(async () => {
    await rm(cloneRoot, { recursive: true, force: true });
    await pg?.stop();
  });

  function appWith() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
  }

  async function setupRepoAndPr(app: Awaited<ReturnType<typeof appWith>>, clonePath: string | null) {
    const repoRepo = new RepoRepository(pg.handle.db);
    const name = `ctx-repo-${Math.random().toString(36).slice(2)}`;
    const repo = await repoRepo.insert({
      workspaceId,
      owner: 'acme',
      name,
      fullName: `acme/${name}`,
      createdBy: (await pg.handle.db.select().from(t.users).limit(1))[0]!.id,
    });
    if (clonePath) await repoRepo.updateClonePath(repo.id, clonePath);

    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo.id,
        number: 900 + Math.floor(Math.random() * 10000),
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    return { repo, pr: pr! };
  }

  async function createAgent(app: Awaited<ReturnType<typeof appWith>>, name: string) {
    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review the diff.' },
    });
    return created.json() as { id: string };
  }

  it('AC-20/AC-23/AC-24/AC-26: attached agent docs reach the prompt under untrusted wrapping, and are recorded in the trace', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(app, cloneRoot);
    const agent = await createAgent(app, 'Sec Reviewer');

    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/context`,
      payload: {
        docs: [
          { path: 'docs/public-api.md', order: 1 },
          { path: 'specs/security-baseline.md', order: 0 },
        ],
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    const runId = res.json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const llm = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(llm).toHaveLength(1);

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    // AC-19: agent order preserved (security-baseline first, order 0)
    expect(trace.specs_read).toEqual(['specs/security-baseline.md', 'docs/public-api.md']);
    expect(trace.prompt_assembly.spec_blocks).toHaveLength(2);
    expect(trace.prompt_assembly.spec_blocks[0]).toMatchObject({
      path: 'specs/security-baseline.md',
      body: '# Security baseline\n\nNever hardcode secrets.',
    });
    expect(trace.prompt_assembly.spec_blocks[0].tokens).toBeGreaterThan(0);
    expect(trace.prompt_assembly.user).toContain('## Project context');
    expect(trace.prompt_assembly.user).toContain('Never hardcode secrets.');
    expect(trace.prompt_assembly.user).toContain('<untrusted source="spec-0">');

    await app.close();
  });

  it('AC-16: agent inherits docs attached to an enabled linked skill', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(app, cloneRoot);
    const agent = await createAgent(app, 'Skill Inheriting Reviewer');

    const skillCreated = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'Security rubric', description: 'x', type: 'custom', body: 'Enforce security.' },
    });
    const skill = skillCreated.json() as { id: string };
    await app.inject({
      method: 'POST',
      url: `/skills/${skill.id}/context`,
      payload: { docs: [{ path: 'specs/security-baseline.md', order: 0 }] },
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_id: skill.id, order: 0, enabled: true },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    const runId = res.json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.specs_read).toEqual(['specs/security-baseline.md']);
    expect(trace.prompt_assembly.user).toContain('Never hardcode secrets.');

    await app.close();
  });

  it('AC-19: agent-level attachment wins its position over the same doc inherited from a skill (dedupe keeps first)', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(app, cloneRoot);
    const agent = await createAgent(app, 'Dedupe Reviewer');

    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/context`,
      payload: { docs: [{ path: 'specs/security-baseline.md', order: 0 }] },
    });

    const skillCreated = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'Dup rubric', description: 'x', type: 'custom', body: 'Rules.' },
    });
    const skill = skillCreated.json() as { id: string };
    await app.inject({
      method: 'POST',
      url: `/skills/${skill.id}/context`,
      payload: {
        docs: [
          { path: 'specs/security-baseline.md', order: 0 },
          { path: 'docs/public-api.md', order: 1 },
        ],
      },
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_id: skill.id, order: 0, enabled: true },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    const runId = res.json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    // deduped: security-baseline appears once, at its agent-level position
    expect(trace.specs_read).toEqual(['specs/security-baseline.md', 'docs/public-api.md']);

    await app.close();
  });

  it('AC-28: a missing/deleted attached path is skipped without failing the run', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(app, cloneRoot);
    const agent = await createAgent(app, 'Missing Doc Reviewer');

    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/context`,
      payload: {
        docs: [
          { path: 'specs/does-not-exist.md', order: 0 },
          { path: 'specs/security-baseline.md', order: 1 },
        ],
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    const runId = res.json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.specs_read).toEqual(['specs/security-baseline.md']);
    expect(trace.prompt_assembly.spec_blocks).toHaveLength(1);

    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews).toHaveLength(1);

    await app.close();
  });

  it('AC-21: no attach + no inherit omits the Project context section entirely — zero extra LLM calls', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(app, cloneRoot);
    const agent = await createAgent(app, 'Plain Reviewer');

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    const runId = res.json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.specs_read).toEqual([]);
    expect(trace.prompt_assembly.spec_blocks).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('## Project context');

    await app.close();
  });
});
