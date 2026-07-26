import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import { MockLLMProvider } from '../../adapters/mocks.js';
import { RepoRepository } from '../repos/repository.js';
import { AgentsRepository } from '../agents/repository.js';
import * as t from '../../db/schema.js';
import { EvalsService } from './service.js';
import { NotFoundError } from '../../platform/errors.js';
import type {
  LLMProvider,
  CompletionRequest,
  StructuredRequest,
  StructuredResult,
  Review,
} from '@devdigest/shared';

/**
 * T2 — agent-eval service + repository (mint / run / dashboard / tenancy).
 * Real Postgres via testcontainers; the LLM is always mocked (no network,
 * deterministic). Skipped cleanly when Docker isn't reachable.
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

/** Throws on the Nth `completeStructured` call, otherwise delegates to `inner`. */
class FlakyLLMProvider implements LLMProvider {
  readonly id: 'openai' | 'anthropic' | 'openrouter';
  calls: { method: string; req: unknown }[] = [];
  private count = 0;

  constructor(
    private inner: MockLLMProvider,
    private failOnCall: number,
  ) {
    this.id = inner.id;
  }

  listModels() {
    return this.inner.listModels();
  }

  complete(req: CompletionRequest) {
    return this.inner.complete(req);
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.count++;
    this.calls.push({ method: 'completeStructured', req });
    if (this.count === this.failOnCall) throw new Error('simulated provider failure');
    return this.inner.completeStructured(req);
  }

  embed(texts: string[]) {
    return this.inner.embed(texts);
  }
}

d('T2 agent-eval service (Testcontainers pg)', () => {
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

  async function createAgent(
    app: Awaited<ReturnType<typeof appWith>>,
    overrides: Partial<{ name: string; systemPrompt: string; model: string; provider: string }> = {},
  ) {
    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: overrides.name ?? `Agent ${Math.random().toString(36).slice(2)}`,
        provider: overrides.provider ?? 'openai',
        model: overrides.model ?? 'gpt-4.1',
        system_prompt: overrides.systemPrompt ?? 'Review the diff for security issues.',
      },
    });
    return created.json() as { id: string; version: number };
  }

  /** A PR + one file with a patch + a review + one finding, owned by `agentId`. */
  async function createPrWithFinding(
    agentId: string,
    decision: 'accepted' | 'dismissed',
    ws = workspaceId,
  ) {
    const repoRepo = new RepoRepository(pg.handle.db);
    const name = `eval-repo-${Math.random().toString(36).slice(2)}`;
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

  it('AC-1/AC-4: mints an agent-owned case from an accepted finding with the single-file diff', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await createAgent(app);
    const { finding } = await createPrWithFinding(agent.id, 'accepted');

    const service = new EvalsService(app.container);
    const evalCase = await service.mintFromFinding(workspaceId, finding.id);

    expect(evalCase.owner_kind).toBe('agent');
    expect(evalCase.owner_id).toBe(agent.id);
    expect(evalCase.input_diff).toContain('stripeKey');
    expect(evalCase.expected_output).toEqual([
      {
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
      },
    ]);

    await app.close();
  });

  it('AC-2: mints an agent-owned decoy case (empty expected_output) from a dismissed finding', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await createAgent(app);
    const { finding } = await createPrWithFinding(agent.id, 'dismissed');

    const service = new EvalsService(app.container);
    const evalCase = await service.mintFromFinding(workspaceId, finding.id);

    expect(evalCase.owner_kind).toBe('agent');
    expect(evalCase.expected_output).toEqual([]);

    await app.close();
  });

  it('AC-5: re-minting the same finding returns the existing case, not a duplicate', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await createAgent(app);
    const { finding } = await createPrWithFinding(agent.id, 'accepted');

    const service = new EvalsService(app.container);
    const first = await service.mintFromFinding(workspaceId, finding.id);
    const second = await service.mintFromFinding(workspaceId, finding.id);

    expect(second.id).toBe(first.id);
    const summaries = await service.listAgentSummaries(workspaceId, agent.id);
    expect(summaries.filter((s) => s.id === first.id)).toHaveLength(1);

    await app.close();
  });

  it('AC-37: mint 404s when the finding does not belong to the caller workspace', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);

    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-ws' }).returning();
    const agent = await createAgent(app);
    const { finding } = await createPrWithFinding(agent.id, 'accepted', otherWs!.id);

    const service = new EvalsService(app.container);
    await expect(service.mintFromFinding(workspaceId, finding.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    await app.close();
  });

  it('AC-8/AC-9/AC-14: run-all uses the agent\'s own prompt/model and the scorer makes zero LLM calls', async () => {
    const systemPrompt = 'Custom agent system prompt for T2.';
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await createAgent(app, { systemPrompt, model: 'gpt-4.1-mini' });
    const { finding } = await createPrWithFinding(agent.id, 'accepted');

    const service = new EvalsService(app.container);
    await service.mintFromFinding(workspaceId, finding.id);

    const summaries = await service.runAllForAgent(workspaceId, agent.id, true);

    expect(summaries).toHaveLength(1);
    expect(llm.calls).toHaveLength(1); // one review call, zero extra calls from scoreEval
    const call = llm.calls[0]!;
    expect(call.method).toBe('completeStructured');
    const req = call.req as StructuredRequest<unknown>;
    expect(req.model).toBe('gpt-4.1-mini');
    expect(JSON.stringify(req.messages)).toContain(systemPrompt);

    await app.close();
  });

  it('AC-12: run-all on an agent with zero cases is a no-op, not an error', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await createAgent(app);

    const service = new EvalsService(app.container);
    const summaries = await service.runAllForAgent(workspaceId, agent.id, true);

    expect(summaries).toEqual([]);
    expect(llm.calls).toHaveLength(0);

    await app.close();
  });

  it('AC-13/AC-44: one case failing during run-all is recorded failed (metrics null) and the rest continue', async () => {
    const inner = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const flaky = new FlakyLLMProvider(inner, 1); // first case fails
    const app = await appWith(flaky);
    const agent = await createAgent(app);

    const { finding: f1 } = await createPrWithFinding(agent.id, 'accepted');
    const { finding: f2 } = await createPrWithFinding(agent.id, 'dismissed');

    const service = new EvalsService(app.container);
    await service.mintFromFinding(workspaceId, f1.id);
    await service.mintFromFinding(workspaceId, f2.id);

    const summaries = await service.runAllForAgent(workspaceId, agent.id, true);

    expect(summaries).toHaveLength(2);
    const failed = summaries.find((s) => s.last_run?.pass === false);
    expect(failed).toBeDefined();
    const succeeded = summaries.find((s) => s.id !== failed?.id);
    expect(succeeded?.last_run?.pass).toBeDefined();

    // AC-44: every persisted run records the agent's version.
    const runs = await service.runsForAgent(workspaceId, agent.id);
    expect(runs).toHaveLength(2);
    for (const r of runs) expect(r.agent_version).toBe(agent.version);
    expect(runs.every((r) => r.batch_id !== null)).toBe(true);
    expect(new Set(runs.map((r) => r.batch_id)).size).toBe(1); // same run-all batch

    await app.close();
  });

  it('AC-41: run-all rejects without confirmation', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await createAgent(app);
    const { finding } = await createPrWithFinding(agent.id, 'accepted');

    const service = new EvalsService(app.container);
    await service.mintFromFinding(workspaceId, finding.id);

    await expect(service.runAllForAgent(workspaceId, agent.id, false)).rejects.toThrow();
    expect(llm.calls).toHaveLength(0);

    await app.close();
  });

  it('AC-42: single-case run executes directly with no batch id', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await createAgent(app);
    const { finding } = await createPrWithFinding(agent.id, 'accepted');

    const service = new EvalsService(app.container);
    const evalCase = await service.mintFromFinding(workspaceId, finding.id);
    const summary = await service.runOneAgentCase(workspaceId, agent.id, evalCase.id);

    expect(summary.last_run).not.toBeNull();
    const runs = await service.runsForAgent(workspaceId, agent.id);
    expect(runs[0]!.batch_id).toBeNull();

    await app.close();
  });

  it('AC-37: run/list/estimate 404 for a case belonging to a different agent', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agentA = await createAgent(app, { name: 'Agent A' });
    const agentB = await createAgent(app, { name: 'Agent B' });
    const { finding } = await createPrWithFinding(agentA.id, 'accepted');

    const service = new EvalsService(app.container);
    const evalCase = await service.mintFromFinding(workspaceId, finding.id);

    await expect(
      service.runOneAgentCase(workspaceId, agentB.id, evalCase.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.deleteAgentCase(workspaceId, agentB.id, evalCase.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    await app.close();
  });

  it('AC-24/AC-26: dashboards aggregate the latest batch and expose recent runs', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await createAgent(app);
    const { finding } = await createPrWithFinding(agent.id, 'accepted');

    const service = new EvalsService(app.container);
    await service.mintFromFinding(workspaceId, finding.id);
    await service.runAllForAgent(workspaceId, agent.id, true);

    const perAgent = await service.agentDashboard(workspaceId, agent.id);
    expect(perAgent.cases_total).toBe(1);
    expect(perAgent.current.traces_total).toBe(1);
    expect(perAgent.recent_runs).toHaveLength(1);

    const overview = await service.dashboardOverview(workspaceId);
    const row = overview.agents.find((a) => a.agent_id === agent.id);
    expect(row?.last_run_pass_count?.total).toBe(1);
    expect(overview.recent_runs.length).toBeGreaterThan(0);

    await app.close();
  });

  it('AC-33: creating a case with invalid expected_output is rejected and persists nothing', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await createAgent(app);

    const service = new EvalsService(app.container);
    await expect(
      service.createAgentCase(workspaceId, agent.id, {
        owner_kind: 'agent',
        owner_id: agent.id,
        name: 'Bad case',
        input_diff: 'diff',
        expected_output: [{ not: 'a valid expected finding' }],
      }),
    ).rejects.toThrow();

    const summaries = await service.listAgentSummaries(workspaceId, agent.id);
    expect(summaries).toEqual([]);

    await app.close();
  });

  it('AC-32: a manually-authored case runs through the same run-all path as minted ones', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await createAgent(app);

    const service = new EvalsService(app.container);
    const created = await service.createAgentCase(workspaceId, agent.id, {
      owner_kind: 'agent',
      owner_id: agent.id,
      name: 'Hand-authored decoy',
      input_diff: '@@ -1,1 +1,1 @@\n+const x = 1;',
      expected_output: [],
    });

    const summaries = await service.runAllForAgent(workspaceId, agent.id, true);
    expect(summaries.map((s) => s.id)).toContain(created.id);

    await app.close();
  });

  it('unrelated repository AgentsRepository sanity check: version bump reflected in run records', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await createAgent(app);
    const { finding } = await createPrWithFinding(agent.id, 'accepted');

    const service = new EvalsService(app.container);
    await service.mintFromFinding(workspaceId, finding.id);
    await service.runAllForAgent(workspaceId, agent.id, true);

    const agentsRepo = new AgentsRepository(pg.handle.db);
    await agentsRepo.update(workspaceId, agent.id, { systemPrompt: 'Updated prompt.' });

    await service.runAllForAgent(workspaceId, agent.id, true);
    const runs = await service.runsForAgent(workspaceId, agent.id);
    const versions = new Set(runs.map((r) => r.agent_version));
    expect(versions.size).toBe(2);

    await app.close();
  });
});
