import { describe, expect, it } from 'vitest';
import { registerGetFindings } from '../tools/get-findings.js';
import { captureTools, fakeClient, makeFinding, makePr, makeRepo, makeReview, parse } from './helpers.js';

function findingsClient(reviews: ReturnType<typeof makeReview>[]) {
  return fakeClient({
    getRepos: async () => [makeRepo({ owner: 'acme', name: 'web' })],
    getPulls: async () => [makePr({ id: 'pr-1', number: 42 })],
    getReviews: async () => reviews,
  });
}

describe('get_findings handler', () => {
  it('returns the latest verdict and findings', async () => {
    const client = findingsClient([makeReview({ findings: [makeFinding({ severity: 'WARNING' })] })]);
    const { server, handlers } = captureTools();
    registerGetFindings(server, client);
    const result = await handlers.get('get_findings')!({ owner: 'acme', repo: 'web', pr_number: 42 });
    expect(result.isError).toBeUndefined();
    const payload = parse<{ verdict: { status: string; counts: { warning: number } } }>(result);
    expect(payload.verdict.status).toBe('pass');
    expect(payload.verdict.counts.warning).toBe(1);
  });

  it('returns an actionable isError when no review exists yet', async () => {
    const client = findingsClient([makeReview({ kind: 'summary' })]);
    const { server, handlers } = captureTools();
    registerGetFindings(server, client);
    const result = await handlers.get('get_findings')!({ owner: 'acme', repo: 'web', pr_number: 42 });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/run run_agent_on_pull_request first/);
  });
});
