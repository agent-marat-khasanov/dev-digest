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
import { MockLLMProvider } from '../../adapters/mocks.js';
import { RepoRepository } from '../repos/repository.js';
import { OnboardingService, type Logger } from './service.js';
import type {
  DegradedReason,
  IndexState,
  IndexStatus,
  ReachableFacts,
  RepoIntel,
  RepoMapResult,
} from '../repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[onboarding] Docker not available — skipping integration tests.');
}

/**
 * A fully deterministic RepoIntel double — the onboarding service's ONLY
 * fact source besides the guarded clone-manifest read (AC-1). Every "extra"
 * facade method throws so a test would fail loudly if the service started
 * reaching for facts beyond the documented five (AC-8a: no extra gathering).
 */
class FakeRepoIntel implements RepoIntel {
  constructor(
    private opts: {
      status?: IndexStatus;
      degraded?: boolean;
      degradedReason?: DegradedReason;
      lastIndexedSha?: string;
      filesIndexed?: number;
      topFiles?: string[];
      criticalPaths?: string[][];
      reachableFacts?: Record<string, ReachableFacts>;
      repoMap?: string;
    } = {},
  ) {}

  async getIndexState(repoId: string): Promise<IndexState> {
    return {
      repoId,
      status: this.opts.status ?? 'full',
      filesIndexed: this.opts.filesIndexed ?? 42,
      filesSkipped: 0,
      durationMs: 100,
      lastIndexedSha: this.opts.lastIndexedSha ?? 'sha-1',
      indexerVersion: 1,
      updatedAt: new Date(),
      degraded: this.opts.degraded ?? false,
      degradedReason: this.opts.degradedReason,
    };
  }

  async getTopFilesByRank(): Promise<string[]> {
    return this.opts.topFiles ?? ['src/server.ts', 'src/app.ts', 'src/routes.ts'];
  }

  async getCriticalPaths(): Promise<string[][]> {
    return this.opts.criticalPaths ?? [['src/server.ts', 'src/app.ts']];
  }

  async getReachableFacts(): Promise<Record<string, ReachableFacts>> {
    return this.opts.reachableFacts ?? { 'src/server.ts': { endpoints: ['GET /health'], crons: [] } };
  }

  async getRepoMap(): Promise<RepoMapResult> {
    return { text: this.opts.repoMap ?? '# repo map\nsrc/server.ts', tokens: 12, cached: true };
  }

  // --- Everything below is NOT part of the onboarding fact-gathering
  // contract (AC-1). Throwing proves the service never reaches for them.
  async indexRepo(): Promise<never> {
    throw new Error('unexpected: indexRepo');
  }
  async refreshIndex(): Promise<never> {
    throw new Error('unexpected: refreshIndex');
  }
  async getBlastRadius(): Promise<never> {
    throw new Error('unexpected: getBlastRadius');
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
}

/** A minimal, schema-valid OnboardingModelOutput fixture (see prompt.ts). */
function modelFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    architecture: { body: 'The app boots from src/server.ts.', diagram: null },
    critical_paths: {
      body: 'The main chain runs server -> app.',
      items: [{ path: 'src/server.ts', role: 'HTTP entrypoint' }],
    },
    reading_path: {
      body: 'Start at the entrypoint, then the app wiring.',
      items: [{ path: 'src/app.ts', why: 'wires the Fastify app' }],
    },
    first_tasks: { body: 'Try adding a health check route.' },
    run_locally: { body: 'Install deps, then run the dev script.' },
    ...overrides,
  };
}

d('onboarding module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let cloneRoot: string;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;

    cloneRoot = await mkdtemp(join(tmpdir(), 'onboarding-it-'));
    await writeFile(
      join(cloneRoot, 'package.json'),
      JSON.stringify({ scripts: { dev: 'tsx watch src/server.ts', build: 'tsc', test: 'vitest' } }),
    );
  });

  afterAll(async () => {
    await rm(cloneRoot, { recursive: true, force: true });
    await pg?.stop();
  });

  function config() {
    return loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
  }

  /** Builds a real Fastify app (routes + container) for HTTP-level assertions. */
  function appWith(opts: { llm?: MockLLMProvider; repoIntel?: RepoIntel } = {}) {
    const llm = opts.llm ?? new MockLLMProvider('openai', { structured: modelFixture() });
    const repoIntel = opts.repoIntel ?? new FakeRepoIntel();
    return {
      llm,
      repoIntel,
      app: buildApp({
        config: config(),
        db: pg.handle.db,
        overrides: { llm: { openrouter: llm }, repoIntel },
      }),
    };
  }

  /** Bypasses HTTP — used for the AC-18 structured-log assertion (silent logger in tests). */
  function serviceWith(opts: { llm?: MockLLMProvider; repoIntel?: RepoIntel } = {}) {
    const llm = opts.llm ?? new MockLLMProvider('openai', { structured: modelFixture() });
    const repoIntel = opts.repoIntel ?? new FakeRepoIntel();
    const container = new Container(config(), pg.handle.db, { llm: { openrouter: llm }, repoIntel });
    return { llm, service: new OnboardingService(container) };
  }

  let repoSeq = 0;
  async function createRepo(clonePath: string | null, ws = workspaceId) {
    const repoRepo = new RepoRepository(pg.handle.db);
    const n = repoSeq++;
    const repo = await repoRepo.insert({
      workspaceId: ws,
      owner: 'acme',
      name: `onboarding-repo-${n}`,
      fullName: `acme/onboarding-repo-${n}`,
      createdBy: (await pg.handle.db.select().from(t.users).limit(1))[0]!.id,
    });
    if (clonePath) await repoRepo.updateClonePath(repo.id, clonePath);
    return repo;
  }

  // ---- AC-1 / AC-4 / AC-5 -------------------------------------------------

  it('AC-5: fresh generation makes exactly ONE completeStructured call and returns the five sections', async () => {
    const { app: appP, llm } = appWith();
    const app = await appP;
    const repo = await createRepo(cloneRoot);

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/tour` });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.mode).toBe('model');
    expect(body.sections.map((s: { id: string }) => s.id)).toEqual([
      'architecture',
      'critical_paths',
      'run_locally',
      'reading_path',
      'first_tasks',
    ]);

    const structuredCalls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(structuredCalls).toHaveLength(1);

    await app.close();
  });

  it('AC-4: critical-paths Open targets point at a real indexed path, and a hallucinated path is dropped', async () => {
    const fixture = modelFixture({
      critical_paths: {
        body: 'body',
        items: [
          { path: 'src/server.ts', role: 'HTTP entrypoint' }, // real (in topFiles/criticalPaths)
          { path: 'src/does-not-exist.ts', role: 'made up by the model' }, // not indexed
        ],
      },
    });
    const { app: appP } = appWith({ llm: new MockLLMProvider('openai', { structured: fixture }) });
    const app = await appP;
    const repo = await createRepo(cloneRoot);

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/tour` });
    expect(res.statusCode).toBe(200);

    const critical = res.json().sections.find((s: { id: string }) => s.id === 'critical_paths');
    const paths = (critical.links ?? []).map((l: { path: string }) => l.path);
    expect(paths).toContain('src/server.ts');
    expect(paths).not.toContain('src/does-not-exist.ts');

    await app.close();
  });

  // ---- AC-8 ----------------------------------------------------------------

  it('AC-8: run_locally commands are derived from the real manifest, not the model', async () => {
    const otherRoot = await mkdtemp(join(tmpdir(), 'onboarding-it-manifest-'));
    try {
      await writeFile(
        join(otherRoot, 'package.json'),
        JSON.stringify({ scripts: { start: 'node dist/index.js' } }),
      );
      // The model's own text differs from the real manifest — proves the
      // rendered commands come from code, not the LLM.
      const fixture = modelFixture({ run_locally: { body: 'Run `docker compose up`.' } });
      const { app: appP } = appWith({ llm: new MockLLMProvider('openai', { structured: fixture }) });
      const app = await appP;
      const repo = await createRepo(otherRoot);

      const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/tour` });
      expect(res.statusCode).toBe(200);

      const runLocally = res.json().sections.find((s: { id: string }) => s.id === 'run_locally');
      expect(runLocally.commands).toEqual(['npm install', 'npm run start']);
      expect(runLocally.commands).not.toContain('docker compose up');

      await app.close();
    } finally {
      await rm(otherRoot, { recursive: true, force: true });
    }
  });

  // ---- AC-8a -----------------------------------------------------------------

  it('AC-8a: first_tasks is pure model narrative, with no extra facade calls (FakeRepoIntel would throw)', async () => {
    const fixture = modelFixture({ first_tasks: { body: 'Add a rate limiter to the public routes.' } });
    const { app: appP } = appWith({ llm: new MockLLMProvider('openai', { structured: fixture }) });
    const app = await appP;
    const repo = await createRepo(cloneRoot);

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/tour` });
    expect(res.statusCode).toBe(200);

    const firstTasks = res.json().sections.find((s: { id: string }) => s.id === 'first_tasks');
    expect(firstTasks.body).toBe('Add a rate limiter to the public routes.');
    expect(firstTasks.links).toBeFalsy();

    await app.close();
  });

  // ---- AC-9 ------------------------------------------------------------------

  it('AC-9: degraded index renders a skeleton with zero model calls', async () => {
    const repoIntel = new FakeRepoIntel({ status: 'degraded', degraded: true, degradedReason: 'index_partial' });
    const { app: appP, llm } = appWith({ repoIntel });
    const app = await appP;
    const repo = await createRepo(cloneRoot);

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/tour` });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.mode).toBe('skeleton');
    expect(body.reason).toBe('index_partial');
    expect(body.sections).toHaveLength(5);
    expect(llm.calls).toHaveLength(0);

    await app.close();
  });

  it('AC-9: repo_too_large is treated as a degraded skeleton, never a model call', async () => {
    const repoIntel = new FakeRepoIntel({ status: 'degraded', degraded: true, degradedReason: 'repo_too_large' });
    const { app: appP, llm } = appWith({ repoIntel });
    const app = await appP;
    const repo = await createRepo(cloneRoot);

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/tour` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ mode: 'skeleton', reason: 'repo_too_large' });
    expect(llm.calls).toHaveLength(0);

    await app.close();
  });

  // ---- AC-11 -----------------------------------------------------------------

  it('AC-11: a completeStructured failure falls back to a skeleton (200, not a 5xx)', async () => {
    // Fixture fails the OnboardingModelOutput schema -> MockLLMProvider throws.
    const failing = new MockLLMProvider('openai', { structured: { not: 'valid' } });
    const { app: appP } = appWith({ llm: failing });
    const app = await appP;
    const repo = await createRepo(cloneRoot);

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/tour` });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.mode).toBe('skeleton');
    expect(body.reason).toBe('model_failed');

    await app.close();
  });

  // ---- AC-12 -----------------------------------------------------------------

  it('AC-12: a never-cloned repo returns not_available/not_cloned, never a 500, no skeleton attempted', async () => {
    const { app: appP, llm } = appWith();
    const app = await appP;
    const repo = await createRepo(null);

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/tour` });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body).toMatchObject({ mode: 'not_available', reason: 'not_cloned', sections: [] });
    expect(body.generated_at).toBeNull();
    expect(llm.calls).toHaveLength(0);

    await app.close();
  });

  // ---- AC-18 / AC-25 -----------------------------------------------------------

  it('AC-18: logs cost_usd/tokens/model on generation; AC-25: persists + exposes them on `generated`', async () => {
    const { llm, service } = serviceWith();
    const repo = await createRepo(cloneRoot);

    const logs: { obj: unknown; msg?: string }[] = [];
    const logger: Logger = { info: (obj, msg) => logs.push({ obj, msg }) };

    const result = await service.getTour(workspaceId, repo.id, logger);
    expect(result.mode).toBe('model');

    const costLog = logs.find((l) => (l.obj as { cost_usd?: unknown }).cost_usd !== undefined);
    expect(costLog).toBeDefined();
    expect(costLog!.obj).toMatchObject({ cost_usd: 0.001, tokens_in: 100, tokens_out: 50 });
    expect((costLog!.obj as { model: string }).model).toBeTruthy();

    expect(result.generated).toMatchObject({ cost_usd: 0.001, tokens_in: 100, tokens_out: 50 });
    expect(result.generated!.model).toBeTruthy();

    // Persisted row carries the same cost/tokens (not just the in-memory response).
    const [row] = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repo.id));
    expect(row).toMatchObject({ costUsd: 0.001, tokensIn: 100, tokensOut: 50 });
    expect(row!.model).toBeTruthy();

    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
  });

  // ---- AC-22 --------------------------------------------------------------------

  it('AC-22: a repo in another workspace is not reachable (404), not an information leak', async () => {
    const { app: appP } = appWith();
    const app = await appP;
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-onboarding-ws' }).returning();
    const repo = await createRepo(cloneRoot, otherWs!.id);

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/tour` });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  // ---- AC-23 / AC-24 -----------------------------------------------------------

  it('AC-23: a second request for the same indexed SHA is a cache hit (zero model calls)', async () => {
    const { app: appP, llm } = appWith();
    const app = await appP;
    const repo = await createRepo(cloneRoot);

    const first = await app.inject({ method: 'GET', url: `/repos/${repo.id}/tour` });
    expect(first.statusCode).toBe(200);
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    const second = await app.inject({ method: 'GET', url: `/repos/${repo.id}/tour` });
    expect(second.statusCode).toBe(200);
    expect(second.json().mode).toBe('model');
    // No additional completeStructured call on the cache hit.
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    await app.close();
  });

  it('AC-24: a changed indexed SHA is a cache miss and regenerates', async () => {
    const repoIntelV1 = new FakeRepoIntel({ lastIndexedSha: 'sha-v1' });
    const { app: appP, llm } = appWith({ repoIntel: repoIntelV1 });
    const app = await appP;
    const repo = await createRepo(cloneRoot);

    const first = await app.inject({ method: 'GET', url: `/repos/${repo.id}/tour` });
    expect(first.statusCode).toBe(200);
    expect(first.json().index.sha).toBe('sha-v1');
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    await app.close();

    // Re-index bumped the SHA — a fresh app pointed at the same DB row, new repoIntel.
    const repoIntelV2 = new FakeRepoIntel({ lastIndexedSha: 'sha-v2' });
    const app2 = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { llm: { openrouter: llm }, repoIntel: repoIntelV2 },
    });

    const second = await app2.inject({ method: 'GET', url: `/repos/${repo.id}/tour` });
    expect(second.statusCode).toBe(200);
    expect(second.json().index.sha).toBe('sha-v2');
    // A NEW completeStructured call happened for the new SHA (2 total, not 1).
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(2);

    await app2.close();
  });

  it('AC-15/AC-24: explicit regenerate bypasses the cache even when the SHA is unchanged', async () => {
    const { app: appP, llm } = appWith();
    const app = await appP;
    const repo = await createRepo(cloneRoot);

    await app.inject({ method: 'GET', url: `/repos/${repo.id}/tour` });
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/tour/regenerate` });
    expect(res.statusCode).toBe(200);
    expect(res.json().mode).toBe('model');
    // Same SHA as before, but regenerate forces a second call (cache bypass).
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(2);

    await app.close();
  });
});
