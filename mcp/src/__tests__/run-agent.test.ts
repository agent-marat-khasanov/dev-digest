import { describe, expect, it } from 'vitest';
import { registerRunAgentOnPullRequest, waitForTerminal } from '../tools/run-agent-on-pull-request.js';
import {
  captureTools,
  fakeClient,
  makeAgent,
  makeFinding,
  makePr,
  makeRepo,
  makeReview,
  makeRun,
  parse,
} from './helpers.js';

const immediateSleep = async (): Promise<void> => {};

describe('waitForTerminal', () => {
  it('returns statuses once all target runs are terminal (no sleep needed)', async () => {
    const client = fakeClient({ getRuns: async () => [makeRun({ run_id: 'run-1', status: 'done' })] });
    const statuses = await waitForTerminal(client, 'pr-1', ['run-1'], {
      sleep: async () => {
        throw new Error('should not sleep when already terminal');
      },
    });
    expect(statuses?.get('run-1')).toBe('done');
  });

  it('polls until a running run becomes terminal', async () => {
    let calls = 0;
    const client = fakeClient({
      getRuns: async () => {
        calls += 1;
        return [makeRun({ run_id: 'run-1', status: calls < 3 ? 'running' : 'done' })];
      },
    });
    const statuses = await waitForTerminal(client, 'pr-1', ['run-1'], { sleep: immediateSleep });
    expect(statuses?.get('run-1')).toBe('done');
    expect(calls).toBe(3);
  });

  it('returns null on timeout', async () => {
    let clock = 1_000;
    const client = fakeClient({
      runTimeoutMs: 2_000,
      getRuns: async () => [makeRun({ run_id: 'run-1', status: 'running' })],
    });
    const statuses = await waitForTerminal(client, 'pr-1', ['run-1'], {
      sleep: async () => {
        clock += 1_000;
      },
      now: () => clock,
    });
    expect(statuses).toBeNull();
  });
});

function runReadyClient() {
  return fakeClient({
    getRepos: async () => [makeRepo({ owner: 'acme', name: 'web' })],
    getPulls: async () => [makePr({ id: 'pr-1', number: 42 })],
    getAgents: async () => [makeAgent({ id: 'a1', name: 'Security' })],
    postReview: async () => ({
      pr_id: 'pr-1',
      runs: [{ run_id: 'run-1', agent_id: 'a1', agent_name: 'Security' }],
      reviews: [],
    }),
    getRuns: async () => [makeRun({ run_id: 'run-1', status: 'done' })],
    getReviews: async () => [makeReview({ findings: [makeFinding({ severity: 'CRITICAL' })] })],
  });
}

describe('run_agent_on_pull_request handler', () => {
  it('resolves → runs → waits → returns the verdict and findings', async () => {
    const { server, handlers } = captureTools();
    registerRunAgentOnPullRequest(server, runReadyClient());
    const result = await handlers.get('run_agent_on_pull_request')!({
      owner: 'acme',
      repo: 'web',
      pr_number: 42,
      agent: 'Security',
    });
    expect(result.isError).toBeUndefined();
    const payload = parse<{ verdict: { status: string; counts: { critical: number } }; warnings?: string }>(result);
    expect(payload.verdict.status).toBe('blocked');
    expect(payload.verdict.counts.critical).toBe(1);
    expect(payload.warnings).toBeUndefined();
  });

  it('returns an actionable isError when the repo is unknown', async () => {
    const { server, handlers } = captureTools();
    registerRunAgentOnPullRequest(server, fakeClient({ getRepos: async () => [] }));
    const result = await handlers.get('run_agent_on_pull_request')!({
      owner: 'acme',
      repo: 'web',
      pr_number: 42,
      agent: 'Security',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/register it first/);
  });

  it('reports "still running" on timeout (runTimeoutMs 0)', async () => {
    const client = fakeClient({
      runTimeoutMs: 0,
      getRepos: async () => [makeRepo({ owner: 'acme', name: 'web' })],
      getPulls: async () => [makePr({ id: 'pr-1', number: 42 })],
      getAgents: async () => [makeAgent({ id: 'a1', name: 'Security' })],
      postReview: async () => ({
        pr_id: 'pr-1',
        runs: [{ run_id: 'run-1', agent_id: 'a1', agent_name: 'Security' }],
        reviews: [],
      }),
      getRuns: async () => [makeRun({ run_id: 'run-1', status: 'running' })],
    });
    const { server, handlers } = captureTools();
    registerRunAgentOnPullRequest(server, client);
    const result = await handlers.get('run_agent_on_pull_request')!({
      owner: 'acme',
      repo: 'web',
      pr_number: 42,
      agent: 'Security',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/still running/);
  });
});
