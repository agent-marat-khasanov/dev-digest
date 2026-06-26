import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { IssueMeta, RepoRef } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** A diff with one changed file so loadDiff yields a non-empty file list. */
const DIFF = `diff --git a/src/middleware/ratelimit.ts b/src/middleware/ratelimit.ts
--- a/src/middleware/ratelimit.ts
+++ b/src/middleware/ratelimit.ts
@@ -1,2 +1,3 @@
 export const limit = 120;
+export const window = 60;
 export default limit;`;

/** The IntentDraft the mocked LLM returns (schema-validated by the mock). */
const INTENT_FIXTURE = {
  intent: 'Add a token-bucket rate limiter to public endpoints.',
  in_scope: ['Introduce ratelimit middleware'],
  out_of_scope: ['Authentication changes'],
  risks: [
    {
      kind: 'network',
      title: 'Burst rejection',
      explanation: 'Legitimate bursts may be throttled.',
      severity: 'medium',
      file_refs: ['src/middleware/ratelimit.ts'],
    },
  ],
};

let prSeq = 0;
async function setupRepoAndPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  overrides: { headSha?: string; body?: string } = {},
) {
  const name = `payments-api-${prSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: overrides.headSha ?? 'sha-current',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: overrides.body ?? 'Add rate limiting.',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/middleware/ratelimit.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -1,2 +1,3 @@\n export const limit = 120;\n+export const window = 60;\n export default limit;',
  });
  return { repo: repo!, pr: pr! };
}

d('intent module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /**
   * Build an app with a mocked LLM (returns INTENT_FIXTURE), git (returns DIFF),
   * and an optional GitHub override. `review_intent` resolves to the openrouter
   * provider by default, so the mock is registered under that key.
   */
  function appWith(opts: { llm?: MockLLMProvider; github?: MockGitHubClient } = {}) {
    const llm = opts.llm ?? new MockLLMProvider('openai', { structured: INTENT_FIXTURE });
    return {
      llm,
      app: buildApp({
        config: config(),
        db: pg.handle.db,
        overrides: {
          git: new MockGitClient({ diff: DIFF }),
          github: opts.github,
          llm: { openrouter: llm },
        },
      }),
    };
  }

  it('200: generates, persists, and returns the PrIntentRecord shape', async () => {
    const { app: appP } = appWith();
    const app = await appP;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body).toMatchObject({
      pr_id: pr.id,
      intent: INTENT_FIXTURE.intent,
      in_scope: INTENT_FIXTURE.in_scope,
      out_of_scope: INTENT_FIXTURE.out_of_scope,
    });
    expect(body.risks).toHaveLength(1);
    expect(body.risks[0]).toMatchObject({ severity: 'medium', title: 'Burst rejection' });

    // The row is persisted against the current head sha.
    const [row] = await pg.handle.db
      .select()
      .from(t.prIntent)
      .where(eq(t.prIntent.prId, pr.id));
    expect(row!.headSha).toBe('sha-current');
    expect(row!.intent).toBe(INTENT_FIXTURE.intent);

    await app.close();
  });

  it('cache hit: returns the stored intent without invoking the LLM when the head sha matches', async () => {
    const { app: appP, llm } = appWith();
    const app = await appP;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    // Pre-store an intent for the CURRENT head sha.
    await pg.handle.db.insert(t.prIntent).values({
      prId: pr.id,
      intent: 'CACHED intent',
      inScope: ['cached scope'],
      outOfScope: [],
      risks: [],
      headSha: 'sha-current',
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    expect(res.json().intent).toBe('CACHED intent');
    // No generation happened — the LLM was never called.
    expect(llm.calls).toHaveLength(0);

    await app.close();
  });

  it('cache miss on sha change: regenerates and updates the stored head sha', async () => {
    const { app: appP, llm } = appWith();
    const app = await appP;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    // Stored intent belongs to a STALE head sha.
    await pg.handle.db.insert(t.prIntent).values({
      prId: pr.id,
      intent: 'STALE intent',
      inScope: [],
      outOfScope: [],
      risks: [],
      headSha: 'sha-old',
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    expect(res.json().intent).toBe(INTENT_FIXTURE.intent);
    expect(llm.calls.some((c) => c.method === 'completeStructured')).toBe(true);

    const [row] = await pg.handle.db
      .select()
      .from(t.prIntent)
      .where(eq(t.prIntent.prId, pr.id));
    expect(row!.headSha).toBe('sha-current');

    await app.close();
  });

  it('404 when the PR does not exist in the workspace', async () => {
    const { app: appP } = appWith();
    const app = await appP;

    const res = await app.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-0000-0000-000000000000/intent',
    });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('resolves a linked issue and feeds it to the generator as a spec', async () => {
    const github = new (class extends MockGitHubClient {
      async getIssue(_repo: RepoRef, n: number): Promise<IssueMeta> {
        return { number: n, title: 'Spec: throttle the public API', body: 'Limit to 120 req/min.', state: 'open' };
      }
    })();
    const { app: appP, llm } = appWith({ github });
    const app = await appP;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, {
      body: 'Implements the plan. Closes #471.',
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);

    // The linked spec reached the prompt as an untrusted block.
    const call = llm.calls.find((c) => c.method === 'completeStructured')!;
    const user = (call.req as { messages: { content: string }[] }).messages[1]!.content;
    expect(user).toContain('<untrusted source="linked_spec">');
    expect(user).toContain('Spec: throttle the public API');

    await app.close();
  });

  it('degrades to title+diff inference when the linked-issue fetch fails', async () => {
    const github = new (class extends MockGitHubClient {
      async getIssue(): Promise<IssueMeta> {
        throw new Error('no github token');
      }
    })();
    const { app: appP, llm } = appWith({ github });
    const app = await appP;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, {
      body: 'Implements the plan. Closes #471.',
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    // The failure is swallowed — generation still succeeds without a spec.
    expect(res.statusCode).toBe(200);

    const call = llm.calls.find((c) => c.method === 'completeStructured')!;
    const user = (call.req as { messages: { content: string }[] }).messages[1]!.content;
    expect(user).not.toContain('linked_spec');

    await app.close();
  });

  it('propagates LLM failures as a 5xx (the panel degrades client-side)', async () => {
    const failing = new MockLLMProvider('openai', { structured: { not: 'valid' } });
    const { app: appP } = appWith({ llm: failing });
    const app = await appP;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBeGreaterThanOrEqual(500);

    await app.close();
  });
});
