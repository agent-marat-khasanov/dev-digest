import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import { MockLLMProvider } from '../../adapters/mocks.js';
import { RepoRepository } from '../repos/repository.js';
import * as t from '../../db/schema.js';
import type { LLMProvider, Review } from '@devdigest/shared';

/**
 * T3 — agent-eval HTTP routes (Zod validate/serialize, confirm gate, tenancy).
 * Real Postgres via testcontainers; the LLM is always mocked. Skipped cleanly
 * when Docker isn't reachable (see `server/INSIGHTS.md` Docker note).
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const REVIEW_FIXTURE: Review = {
  verdict: 'approve',
  summary: 'Looks fine.',
  score: 90,
  findings: [],
};

d('T3 agent-eval routes (Testcontainers pg)', () => {
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

  function appWith(llm: LLMProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { llm: { [llm.id]: llm } },
    });
  }

  async function createAgent(app: Awaited<ReturnType<typeof appWith>>, name?: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: name ?? `Agent ${Math.random().toString(36).slice(2)}`,
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'Review the diff for security issues.',
      },
    });
    return res.json() as { id: string; version: number };
  }

  /** A PR + one file with a patch + a review + one finding, owned by `agentId`. */
  async function createPrWithFinding(
    agentId: string,
    decision: 'accepted' | 'dismissed',
    ws = workspaceId,
  ) {
    const repoRepo = new RepoRepository(pg.handle.db);
    const name = `eval-route-repo-${Math.random().toString(36).slice(2)}`;
    const repo = await repoRepo.insert({
      workspaceId: ws,
      owner: 'acme',
      name,
      fullName: `acme/${name}`,
      createdBy: (await pg.handle.db.select().from(t.users).limit(1))[0]!.id,
    });

    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
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

    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId: ws,
        prId: pr!.id,
        agentId,
        runId: null,
        kind: 'review',
        verdict: 'request_changes',
        summary: 'Found a hardcoded secret.',
        score: 40,
        model: 'gpt-4.1',
      })
      .returning();

    const [finding] = await pg.handle.db
      .insert(t.findings)
      .values({
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 11,
        endLine: 11,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        rationale: 'Secrets must not be committed.',
        confidence: 0.95,
        acceptedAt: decision === 'accepted' ? new Date() : null,
        dismissedAt: decision === 'dismissed' ? new Date() : null,
      })
      .returning();

    return { repo, pr: pr!, review: review!, finding: finding! };
  }

  it('AC-1: POST /findings/:id/eval-case mints an EvalCase (200)', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await createAgent(app);
    const { finding } = await createPrWithFinding(agent.id, 'accepted');

    const res = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.owner_kind).toBe('agent');
    expect(body.owner_id).toBe(agent.id);
    expect(body.expected_output).toHaveLength(1);

    await app.close();
  });

  it('GET /findings/:id/eval-case/preview returns a dry-run draft, no case is persisted', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agentName = `Preview Agent ${Math.random().toString(36).slice(2)}`;
    const agent = await createAgent(app, agentName);
    const { finding } = await createPrWithFinding(agent.id, 'accepted');

    const res = await app.inject({
      method: 'GET',
      url: `/findings/${finding.id}/eval-case/preview`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.agent_id).toBe(agent.id);
    expect(body.agent_name).toBe(agentName);
    expect(body.decision).toBe('accepted');
    expect(body.expected_output).toHaveLength(1);
    expect(body.existing_case_id).toBeNull();

    const list = await app.inject({ method: 'GET', url: `/agents/${agent.id}/evals` });
    expect(list.json()).toHaveLength(0);

    await app.close();
  });

  it('GET /findings/:id/eval-case/preview 404s for a cross-workspace finding', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);

    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'other-ws-preview' })
      .returning();
    const agentsRepo = new (await import('../agents/repository.js')).AgentsRepository(pg.handle.db);
    const otherAgent = await agentsRepo.insert({
      workspaceId: otherWs!.id,
      name: 'Other-workspace agent',
      provider: 'openai',
      model: 'gpt-4.1',
      systemPrompt: 'x',
    });
    const { finding } = await createPrWithFinding(otherAgent.id, 'accepted', otherWs!.id);

    const res = await app.inject({
      method: 'GET',
      url: `/findings/${finding.id}/eval-case/preview`,
    });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('GET /findings/:id/eval-case/preview rejects a finding with no owning agent (422)', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);

    const repoRepo = new RepoRepository(pg.handle.db);
    const name = `eval-preview-no-agent-${Math.random().toString(36).slice(2)}`;
    const repo = await repoRepo.insert({
      workspaceId,
      owner: 'acme',
      name,
      fullName: `acme/${name}`,
      createdBy: (await pg.handle.db.select().from(t.users).limit(1))[0]!.id,
    });
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo.id,
        number: 900 + Math.floor(Math.random() * 10000),
        title: 'No agent PR',
        author: 'marisa.koch',
        branch: 'feat/no-agent',
        base: 'main',
        headSha: 'a1b2c3d5',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        agentId: null,
        runId: null,
        kind: 'review',
        verdict: 'approve',
        summary: 'Imported review, no agent.',
        score: 90,
        model: 'gpt-4.1',
      })
      .returning();
    const [finding] = await pg.handle.db
      .insert(t.findings)
      .values({
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 1,
        endLine: 1,
        severity: 'WARNING',
        category: 'security',
        title: 'No agent finding',
        rationale: 'x',
        confidence: 0.5,
        acceptedAt: new Date(),
        dismissedAt: null,
      })
      .returning();

    const res = await app.inject({
      method: 'GET',
      url: `/findings/${finding!.id}/eval-case/preview`,
    });
    expect(res.statusCode).toBe(422);

    await app.close();
  });

  it('AC-6: GET /agents/:id/evals returns EvalCaseSummary[]', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await createAgent(app);
    const { finding } = await createPrWithFinding(agent.id, 'accepted');
    await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });

    const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/evals` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].last_run).toBeNull();

    await app.close();
  });

  it('AC-41: GET .../eval-runs/estimate returns case_count + estimated_cost_usd', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await createAgent(app);
    const { finding } = await createPrWithFinding(agent.id, 'accepted');
    await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });

    const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs/estimate` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.case_count).toBe(1);
    expect(typeof body.estimated_cost_usd === 'number' || body.estimated_cost_usd === null).toBe(true);

    await app.close();
  });

  it('AC-41: POST /agents/:id/eval-runs rejects without confirm=true, runs with it', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await createAgent(app);
    const { finding } = await createPrWithFinding(agent.id, 'accepted');
    await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });

    const rejected = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/eval-runs`,
      payload: {},
    });
    expect(rejected.statusCode).toBe(422);
    expect(llm.calls).toHaveLength(0);

    const confirmed = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/eval-runs`,
      payload: { confirm: true },
    });
    expect(confirmed.statusCode).toBe(200);
    const body = confirmed.json();
    expect(body).toHaveLength(1);
    expect(body[0].last_run).not.toBeNull();

    await app.close();
  });

  it('AC-10/42: POST /agents/:id/evals/:caseId/run runs one case directly, no confirm required', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await createAgent(app);
    const { finding } = await createPrWithFinding(agent.id, 'accepted');
    const minted = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    const caseId = minted.json().id as string;

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/evals/${caseId}/run`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().last_run).not.toBeNull();

    await app.close();
  });

  it('AC-31/32: POST /agents/:id/evals creates a case, PATCH edits it, both return EvalCase', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await createAgent(app);

    const created = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/evals`,
      payload: {
        owner_kind: 'agent',
        owner_id: agent.id,
        name: 'Hand-authored decoy',
        input_diff: '@@ -1,1 +1,1 @@\n+const x = 1;',
        expected_output: [],
      },
    });
    expect(created.statusCode).toBe(200);
    const caseBody = created.json();
    expect(caseBody.owner_id).toBe(agent.id);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/agents/${agent.id}/evals/${caseBody.id}`,
      payload: { name: 'Renamed decoy' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().name).toBe('Renamed decoy');

    await app.close();
  });

  it('AC-33: POST /agents/:id/evals rejects invalid expected_output (422), persists nothing', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await createAgent(app);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/evals`,
      payload: {
        owner_kind: 'agent',
        owner_id: agent.id,
        name: 'Bad case',
        input_diff: 'diff',
        expected_output: [{ not: 'a valid expected finding' }],
      },
    });
    expect(res.statusCode).toBe(422);

    const list = await app.inject({ method: 'GET', url: `/agents/${agent.id}/evals` });
    expect(list.json()).toEqual([]);

    await app.close();
  });

  it('DELETE /agents/:id/evals/:caseId deletes a case, 404 on the second delete', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await createAgent(app);
    const { finding } = await createPrWithFinding(agent.id, 'accepted');
    const minted = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    const caseId = minted.json().id as string;

    const first = await app.inject({
      method: 'DELETE',
      url: `/agents/${agent.id}/evals/${caseId}`,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ ok: true });

    const second = await app.inject({
      method: 'DELETE',
      url: `/agents/${agent.id}/evals/${caseId}`,
    });
    expect(second.statusCode).toBe(404);

    await app.close();
  });

  it('AC-26: GET /agents/:id/eval-dashboard returns EvalDashboard', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await createAgent(app);
    const { finding } = await createPrWithFinding(agent.id, 'accepted');
    await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/eval-runs`,
      payload: { confirm: true },
    });

    const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-dashboard` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.cases_total).toBe(1);
    expect(body.current.traces_total).toBe(1);

    await app.close();
  });

  it('AC-27: GET /agents/:id/eval-runs returns EvalRunRecord[] newest first', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await createAgent(app);
    const { finding } = await createPrWithFinding(agent.id, 'accepted');
    await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/eval-runs`,
      payload: { confirm: true },
    });

    const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].agent_version).toBe(agent.version);

    await app.close();
  });

  it('AC-41/43: GET/POST workspace eval-runs estimate + run-all gated by confirm', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await createAgent(app);
    const { finding } = await createPrWithFinding(agent.id, 'accepted');
    await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });

    const estimate = await app.inject({ method: 'GET', url: '/eval-runs/estimate' });
    expect(estimate.statusCode).toBe(200);
    expect(estimate.json().case_count).toBeGreaterThanOrEqual(1);

    const rejected = await app.inject({ method: 'POST', url: '/eval-runs', payload: {} });
    expect(rejected.statusCode).toBe(422);

    const confirmed = await app.inject({
      method: 'POST',
      url: '/eval-runs',
      payload: { confirm: true },
    });
    expect(confirmed.statusCode).toBe(200);
    const overview = confirmed.json();
    expect(overview.agents.some((a: { agent_id: string }) => a.agent_id === agent.id)).toBe(true);

    await app.close();
  });

  it('AC-24: GET /eval-dashboard returns EvalDashboardOverview', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    await createAgent(app);

    const res = await app.inject({ method: 'GET', url: '/eval-dashboard' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.agents)).toBe(true);
    expect(Array.isArray(body.recent_runs)).toBe(true);

    await app.close();
  });

  it('AC-37: agent/case routes 404 for a cross-workspace agent id', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);

    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-ws-routes' }).returning();
    const agentsRepo = new (await import('../agents/repository.js')).AgentsRepository(pg.handle.db);
    const otherAgent = await agentsRepo.insert({
      workspaceId: otherWs!.id,
      name: 'Other-workspace agent',
      provider: 'openai',
      model: 'gpt-4.1',
      systemPrompt: 'x',
    });

    const res = await app.inject({ method: 'GET', url: `/agents/${otherAgent.id}/evals` });
    expect(res.statusCode).toBe(404);

    await app.close();
  });
});
