import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { Container } from '../../platform/container.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import * as t from '../../db/schema.js';
import { MockLLMProvider, MockGitClient, MockGitHubClient } from '../../adapters/mocks.js';
import { RepoRepository } from '../repos/repository.js';
import { BriefService, type Logger } from './service.js';
import type {
  BlastResult,
  IndexState,
  ReachableFacts,
  RepoIntel,
  RepoMapResult,
} from '../repo-intel/types.js';
import type { IssueMeta, RepoRef } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[brief] Docker not available — skipping integration tests.');
}

/**
 * A fully deterministic RepoIntel double — the ONLY blast fact source the
 * brief module reads (`BlastService.getBlast`). Non-blast methods throw so a
 * regression that reaches for unrequested facts fails loudly (the onboarding
 * `FakeRepoIntel` precedent).
 */
class FakeRepoIntel implements RepoIntel {
  constructor(
    private opts: {
      blast?: BlastResult;
      reachable?: Record<string, ReachableFacts>;
    } = {},
  ) {}

  async getBlastRadius(): Promise<BlastResult> {
    return (
      this.opts.blast ?? {
        changedSymbols: [],
        callers: [],
        impactedEndpoints: [],
        degraded: true,
        reason: 'no_data',
      }
    );
  }

  async getReachableFacts(): Promise<Record<string, ReachableFacts>> {
    return this.opts.reachable ?? {};
  }

  // --- Not part of the brief's fact contract — throw if reached. ---
  async indexRepo(): Promise<never> {
    throw new Error('unexpected: indexRepo');
  }
  async refreshIndex(): Promise<never> {
    throw new Error('unexpected: refreshIndex');
  }
  async getIndexState(): Promise<IndexState> {
    throw new Error('unexpected: getIndexState');
  }
  async getRepoMap(): Promise<RepoMapResult> {
    throw new Error('unexpected: getRepoMap');
  }
  async getFileRank(): Promise<never> {
    throw new Error('unexpected: getFileRank');
  }
  async getSymbolsInFiles(): Promise<never> {
    throw new Error('unexpected: getSymbolsInFiles');
  }
  async getCallerSignatures(): Promise<never> {
    throw new Error('unexpected: getCallerSignatures');
  }
  async getUnresolvedReferences(): Promise<never> {
    throw new Error('unexpected: getUnresolvedReferences');
  }
  async getConventionSamples(): Promise<never> {
    throw new Error('unexpected: getConventionSamples');
  }
  async getTopFilesByRank(): Promise<never> {
    throw new Error('unexpected: getTopFilesByRank');
  }
  async getCriticalPaths(): Promise<never> {
    throw new Error('unexpected: getCriticalPaths');
  }
}

/** A minimal, schema-valid BriefModelOutput fixture referencing a real changed file. */
function modelFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    what: 'Adds a token-bucket rate limiter to public endpoints.',
    why: 'Prevent abuse of the public API surface.',
    risk_level: 'medium',
    risks: [
      {
        kind: 'network',
        title: 'Burst rejection',
        explanation: 'Legitimate bursts may be throttled.',
        severity: 'medium',
        file_refs: ['src/middleware/ratelimit.ts'],
      },
    ],
    review_focus: [{ path: 'src/middleware/ratelimit.ts', reason: 'Core limiter logic.' }],
    ...overrides,
  };
}

/** A diff touching the one PR file, so `BlastService.getBlast` sees a non-empty changed-file set. */
const DIFF = `diff --git a/src/middleware/ratelimit.ts b/src/middleware/ratelimit.ts
--- a/src/middleware/ratelimit.ts
+++ b/src/middleware/ratelimit.ts
@@ -1,2 +1,3 @@
 export const limit = 120;
+export const window = 60;
 export default limit;`;

const REAL_BLAST: BlastResult = {
  changedSymbols: [{ file: 'src/middleware/ratelimit.ts', name: 'limit', kind: 'const' }],
  callers: [{ file: 'src/routes/api.ts', symbol: 'handler', viaSymbol: 'limit', line: 10, rank: 5 }],
  impactedEndpoints: ['GET /api/foo'],
  factsByFile: { 'src/routes/api.ts': { endpoints: ['GET /api/foo'], crons: [] } },
  degraded: false,
};

d('brief module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let cloneRoot: string;
  let prSeq = 0;
  let repoSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;

    cloneRoot = await mkdtemp(join(tmpdir(), 'brief-it-'));
    await writeFile(join(cloneRoot, 'specs-a.md'), '# Spec A\n\nInvariant A.');
    await writeFile(join(cloneRoot, 'specs-b.md'), '# Spec B\n\nInvariant B.');
    await writeFile(join(cloneRoot, 'specs-c.md'), '# Spec C\n\nInvariant C.');
  });

  afterAll(async () => {
    await rm(cloneRoot, { recursive: true, force: true });
    await pg?.stop();
  });

  function config() {
    return loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
  }

  async function createRepo(clonePath: string | null, ws = workspaceId) {
    const repoRepo = new RepoRepository(pg.handle.db);
    const n = repoSeq++;
    const repo = await repoRepo.insert({
      workspaceId: ws,
      owner: 'acme',
      name: `brief-repo-${n}`,
      fullName: `acme/brief-repo-${n}`,
      createdBy: (await pg.handle.db.select().from(t.users).limit(1))[0]!.id,
    });
    if (clonePath) await repoRepo.updateClonePath(repo.id, clonePath);
    return repo;
  }

  async function createPr(
    repoId: string,
    overrides: { headSha?: string; body?: string | null; workspaceId?: string } = {},
  ) {
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: overrides.workspaceId ?? workspaceId,
        repoId,
        number: 900 + prSeq++,
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
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/middleware/ratelimit.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -1,2 +1,3 @@\n export const limit = 120;\n+export const window = 60;\n export default limit;',
    });
    return pr!;
  }

  /** Builds a real Fastify app. `risk_brief` resolves to provider `openai` — the mock MUST be
   *  registered under that key (server INSIGHTS gotcha), NOT `openrouter`. */
  function appWith(
    opts: { llm?: MockLLMProvider; repoIntel?: RepoIntel; github?: MockGitHubClient } = {},
  ) {
    const llm = opts.llm ?? new MockLLMProvider('openai', { structured: modelFixture() });
    const repoIntel = opts.repoIntel ?? new FakeRepoIntel();
    return {
      llm,
      app: buildApp({
        config: config(),
        db: pg.handle.db,
        overrides: {
          git: new MockGitClient({ diff: DIFF }),
          github: opts.github,
          llm: { openai: llm },
          repoIntel,
        },
      }),
    };
  }

  /** Bypasses HTTP — used for the cost/tokens/model structured-log assertion (silent logger in
   *  tests; onboarding `serviceWith` precedent). */
  function serviceWith(opts: { llm?: MockLLMProvider; repoIntel?: RepoIntel } = {}) {
    const llm = opts.llm ?? new MockLLMProvider('openai', { structured: modelFixture() });
    const repoIntel = opts.repoIntel ?? new FakeRepoIntel();
    const container = new Container(config(), pg.handle.db, {
      git: new MockGitClient({ diff: DIFF }),
      llm: { openai: llm },
      repoIntel,
    });
    return { llm, service: new BriefService(container) };
  }

  async function createAgentWithContext(app: Awaited<ReturnType<typeof buildApp>>, docs: string[]) {
    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `Agent ${Math.random()}`, provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review.' },
    });
    const agentId = created.json().id as string;
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context`,
      payload: { docs: docs.map((path, order) => ({ path, order })) },
    });
    return agentId;
  }

  // ---- AC-1 / AC-2 / AC-2a / NG2 -------------------------------------------

  it('AC-1/AC-2/AC-2a: assembles artifact-only input (no diff hunks/patches), specs deduped + ordered deterministically', async () => {
    const github = new (class extends MockGitHubClient {
      async getIssue(_repo: RepoRef, n: number): Promise<IssueMeta> {
        return { number: n, title: 'Spec: throttle the public API', body: 'Limit to 120 req/min.', state: 'open' };
      }
    })();
    const { app: appP, llm } = appWith({ repoIntel: new FakeRepoIntel({ blast: REAL_BLAST }), github });
    const app = await appP;
    const repo = await createRepo(cloneRoot);
    const pr = await createPr(repo.id, { body: 'Implements the plan. Closes #471.' });

    // Cached intent — DB-only read, must reach the prompt without a model call.
    await pg.handle.db.insert(t.prIntent).values({
      prId: pr.id,
      intent: 'Add a token-bucket rate limiter.',
      inScope: ['ratelimit middleware'],
      outOfScope: [],
      risks: [],
      headSha: 'sha-current',
    });

    // Two agents with OVERLAPPING attached specs, inserted in an order that would
    // NOT match lexical order if agentsRepo.list ordering leaked through.
    await createAgentWithContext(app, ['specs-b.md', 'specs-a.md']);
    await createAgentWithContext(app, ['specs-a.md', 'specs-c.md']);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);

    // Exactly one model call — gathering itself made zero extra model calls.
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]!.method).toBe('completeStructured');

    const call = llm.calls[0]!;
    const messages = (call.req as { messages: { content: string }[] }).messages;
    const user = messages[1]!.content;

    // Artifact-only: intent, blast, smart-diff (stats-only), linked issue, specs.
    expect(user).toContain('intent_digest');
    expect(user).toContain('blast_summary');
    expect(user).toContain('smart_diff_detail');
    expect(user).toContain('<untrusted source="linked_issue">');
    expect(user).toContain('Spec: throttle the public API');
    expect(user).toContain('spec:specs-a.md');
    expect(user).toContain('spec:specs-b.md');
    expect(user).toContain('spec:specs-c.md');

    // Deduped: each spec label appears exactly once, regardless of the two
    // agents both attaching specs-a.md.
    expect(user.match(/spec:specs-a\.md/g)).toHaveLength(1);

    // Deterministic order: specs-a before specs-b before specs-c (lexical),
    // NOT agent-attachment order (b, a were attached first on agent 1).
    const idxA = user.indexOf('spec:specs-a.md');
    const idxB = user.indexOf('spec:specs-b.md');
    const idxC = user.indexOf('spec:specs-c.md');
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);

    // NG2 hard constraint: no diff hunks/patches ever enter the prompt.
    expect(user).not.toContain('diff --git');
    expect(user).not.toContain('@@');

    // The smart-diff block is the stats-only shape: file path + numeric
    // add/del/finding-line counts, never a pseudocode snippet.
    expect(user).toMatch(/src\/middleware\/ratelimit\.ts \(\+\d+\/-\d+, \d+ finding line\(s\)\)/);

    await app.close();
  });

  // ---- AC-4 -----------------------------------------------------------------

  it('AC-4: exactly ONE completeStructured call, provider resolved via resolveFeatureModel (openai)', async () => {
    const { app: appP, llm } = appWith();
    const app = await appP;
    const repo = await createRepo(cloneRoot);
    const pr = await createPr(repo.id);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);

    const structuredCalls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(structuredCalls).toHaveLength(1);

    const body = res.json();
    expect(body).toMatchObject({
      pr_id: pr.id,
      what: expect.any(String),
      risk_level: 'medium',
    });

    await app.close();
  });

  // ---- AC-8 / AC-10 -----------------------------------------------------------

  it('AC-8: cache hit on matching head_sha returns the stored brief with zero model calls', async () => {
    const { app: appP, llm } = appWith();
    const app = await appP;
    const repo = await createRepo(cloneRoot);
    const pr = await createPr(repo.id, { headSha: 'sha-current' });

    await pg.handle.db.insert(t.prBrief).values({
      prId: pr.id,
      headSha: 'sha-current',
      json: {
        what: 'CACHED what',
        why: 'CACHED why',
        risk_level: 'low',
        risks: [],
        review_focus: [],
        generated_at: '2026-01-01T00:00:00.000Z',
        generated: { model: 'gpt-4.1', cost_usd: 0.001, tokens_in: 10, tokens_out: 5 },
      },
    });

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json().what).toBe('CACHED what');
    expect(llm.calls).toHaveLength(0);

    await app.close();
  });

  it('AC-10: a head_sha mismatch is a cache miss and regenerates + updates the stored head_sha', async () => {
    const { app: appP, llm } = appWith();
    const app = await appP;
    const repo = await createRepo(cloneRoot);
    const pr = await createPr(repo.id, { headSha: 'sha-new' });

    await pg.handle.db.insert(t.prBrief).values({
      prId: pr.id,
      headSha: 'sha-old',
      json: {
        what: 'STALE what',
        why: 'STALE why',
        risk_level: 'low',
        risks: [],
        review_focus: [],
        generated_at: '2026-01-01T00:00:00.000Z',
        generated: null,
      },
    });

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json().what).not.toBe('STALE what');
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    const [row] = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(row!.headSha).toBe('sha-new');

    await app.close();
  });

  it('AC-9: Regenerate bypasses the cache even when the head_sha is unchanged', async () => {
    const { app: appP, llm } = appWith();
    const app = await appP;
    const repo = await createRepo(cloneRoot);
    const pr = await createPr(repo.id);

    const first = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(first.statusCode).toBe(200);
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    const second = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(second.statusCode).toBe(200);
    // Plain re-open is a cache hit — still one total call.
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    const regen = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief/regenerate` });
    expect(regen.statusCode).toBe(200);
    // Regenerate forces a second call despite the unchanged head_sha.
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(2);

    await app.close();
  });

  // ---- AC-13 / AC-14 ----------------------------------------------------------

  it('AC-13/AC-14: missing intent + degraded blast still generate a brief (sections omitted)', async () => {
    const { app: appP, llm } = appWith({ repoIntel: new FakeRepoIntel() /* degraded default */ });
    const app = await appP;
    const repo = await createRepo(null /* no clone, no specs, no issue */);
    const pr = await createPr(repo.id, { body: null });
    // No pr_intent row inserted (AC-13); FakeRepoIntel default is degraded (AC-14).

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ pr_id: pr.id, risk_level: 'medium' });

    const call = llm.calls.find((c) => c.method === 'completeStructured')!;
    const user = (call.req as { messages: { content: string }[] }).messages[1]!.content;
    expect(user).not.toContain('intent_digest');
    expect(user).not.toContain('linked_issue');
    expect(user).not.toContain('spec:');
    // The blast summary line is NEVER omitted, even when degraded.
    expect(user).toContain('blast_summary');

    await app.close();
  });

  // ---- AC-16 ------------------------------------------------------------------

  it('AC-16: a completeStructured failure returns a 5xx and persists NO row', async () => {
    const failing = new MockLLMProvider('openai', { structured: { not: 'valid' } });
    const { app: appP } = appWith({ llm: failing });
    const app = await appP;
    const repo = await createRepo(cloneRoot);
    const pr = await createPr(repo.id);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBeGreaterThanOrEqual(500);

    const [row] = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(row).toBeUndefined();

    await app.close();
  });

  it('AC-16: a failure on Regenerate does NOT overwrite the existing cached row', async () => {
    const failing = new MockLLMProvider('openai', { structured: { not: 'valid' } });
    const { app: appP } = appWith({ llm: failing });
    const app = await appP;
    const repo = await createRepo(cloneRoot);
    const pr = await createPr(repo.id);

    const existing = {
      what: 'EXISTING what',
      why: 'EXISTING why',
      risk_level: 'low' as const,
      risks: [],
      review_focus: [],
      generated_at: '2026-01-01T00:00:00.000Z',
      generated: { model: 'gpt-4.1', cost_usd: 0.001, tokens_in: 10, tokens_out: 5 },
    };
    await pg.handle.db.insert(t.prBrief).values({ prId: pr.id, headSha: pr.headSha, json: existing });

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief/regenerate` });
    expect(res.statusCode).toBeGreaterThanOrEqual(500);

    const [row] = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect((row!.json as typeof existing).what).toBe('EXISTING what');

    await app.close();
  });

  // ---- AC-19 ------------------------------------------------------------------

  it('AC-19: a PR in another workspace is not reachable (404, not an information leak)', async () => {
    const { app: appP } = appWith();
    const app = await appP;
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-brief-ws' }).returning();
    const repo = await createRepo(cloneRoot, otherWs!.id);
    const pr = await createPr(repo.id, { workspaceId: otherWs!.id });

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  // ---- AC-20 ------------------------------------------------------------------

  it('AC-20: the brief route carries a tight per-route rate limit (max 10/min)', async () => {
    // The global @fastify/rate-limit plugin is deliberately NOT registered
    // under NODE_ENV=test (app.ts) so integration suites can hammer routes via
    // inject(); the per-route `config.rateLimit` only takes effect once the
    // plugin is registered. Build an isolated instance with nodeEnv flipped to
    // 'development' (still pointed at the real testcontainer db) so the
    // route-level `{ max: 10, timeWindow: '1 minute' }` (AC-20) is exercised.
    const llm = new MockLLMProvider('openai', { structured: modelFixture() });
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'development' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: llm },
        repoIntel: new FakeRepoIntel(),
      },
    });
    const repo = await createRepo(cloneRoot);
    const pr = await createPr(repo.id);

    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
      lastStatus = res.statusCode;
    }
    expect(lastStatus).toBe(429);

    await app.close();
  });

  // ---- AC-21 / AC-22 -----------------------------------------------------------

  it('AC-21: persists cost/tokens/model alongside the cached brief and exposes them on the response', async () => {
    const { app: appP } = appWith();
    const app = await appP;
    const repo = await createRepo(cloneRoot);
    const pr = await createPr(repo.id);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.generated).toMatchObject({ cost_usd: 0.001, tokens_in: 100, tokens_out: 50 });
    expect(body.generated.model).toBeTruthy();

    const [row] = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    const json = row!.json as { generated: { cost_usd: number; tokens_in: number; tokens_out: number } };
    expect(json.generated).toMatchObject({ cost_usd: 0.001, tokens_in: 100, tokens_out: 50 });

    await app.close();
  });

  it('AC-22: a null costUsd from the provider is persisted/exposed as null without failing generation', async () => {
    const nullCostLlm = new MockLLMProvider('openai', { structured: modelFixture() });
    const originalCompleteStructured = nullCostLlm.completeStructured.bind(nullCostLlm);
    nullCostLlm.completeStructured = (async (req: Parameters<typeof originalCompleteStructured>[0]) => {
      const result = await originalCompleteStructured(req);
      return { ...result, costUsd: null };
    }) as typeof nullCostLlm.completeStructured;
    const { app: appP } = appWith({ llm: nullCostLlm });
    const app = await appP;
    const repo = await createRepo(cloneRoot);
    const pr = await createPr(repo.id);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json().generated.cost_usd).toBeNull();

    const [row] = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    const json = row!.json as { generated: { cost_usd: number | null } };
    expect(json.generated.cost_usd).toBeNull();

    await app.close();
  });

  it('logs cost_usd/tokens_in/tokens_out/model on generation (NFR cost/observability)', async () => {
    const { llm, service } = serviceWith();
    const repo = await createRepo(cloneRoot);
    const pr = await createPr(repo.id);

    const logs: { obj: unknown; msg?: string }[] = [];
    const logger: Logger = { info: (obj, msg) => logs.push({ obj, msg }) };

    const brief = await service.getBrief(workspaceId, pr.id, logger);
    expect(brief.pr_id).toBe(pr.id);
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    const costLog = logs.find((l) => (l.obj as { cost_usd?: unknown }).cost_usd !== undefined);
    expect(costLog).toBeDefined();
    expect(costLog!.obj).toMatchObject({ cost_usd: 0.001, tokens_in: 100, tokens_out: 50 });
    expect((costLog!.obj as { model: string }).model).toBeTruthy();
    expect(costLog!.msg).toBe('brief: generated');
  });

  it('logs cost_usd: null when the provider reports no cost, without failing generation', async () => {
    const nullCostLlm = new MockLLMProvider('openai', { structured: modelFixture() });
    const originalCompleteStructured = nullCostLlm.completeStructured.bind(nullCostLlm);
    nullCostLlm.completeStructured = (async (req: Parameters<typeof originalCompleteStructured>[0]) => {
      const result = await originalCompleteStructured(req);
      return { ...result, costUsd: null };
    }) as typeof nullCostLlm.completeStructured;
    const { service } = serviceWith({ llm: nullCostLlm });
    const repo = await createRepo(cloneRoot);
    const pr = await createPr(repo.id);

    const logs: { obj: unknown; msg?: string }[] = [];
    const logger: Logger = { info: (obj, msg) => logs.push({ obj, msg }) };

    await service.getBrief(workspaceId, pr.id, logger);

    const costLog = logs.find((l) => (l.obj as { cost_usd?: unknown }).cost_usd !== undefined);
    expect(costLog).toBeDefined();
    expect((costLog!.obj as { cost_usd: number | null }).cost_usd).toBeNull();
  });
});
