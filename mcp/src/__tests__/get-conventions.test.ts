import { describe, expect, it } from 'vitest';
import type { Convention, ConventionStatus } from '@devdigest/shared';
import { registerGetConventions } from '../tools/get-conventions.js';
import { captureTools, fakeClient, makeRepo, parse } from './helpers.js';

function makeConvention(o: Partial<Convention> = {}): Convention {
  return {
    id: 'c1',
    repo_id: 'repo-1',
    category: 'style',
    rule: 'use tabs',
    evidence: { file: 'a.ts', line: '1', code: 'x' },
    confidence: 0.9,
    status: 'accepted',
    created_at: 'x',
    updated_at: 'y',
    ...o,
  };
}

describe('get_conventions handler', () => {
  it('returns a compact convention list and forwards the status filter', async () => {
    let receivedStatus: ConventionStatus | undefined;
    const client = fakeClient({
      getRepos: async () => [makeRepo({ owner: 'acme', name: 'web' })],
      getConventions: async (_repoId: string, status?: ConventionStatus) => {
        receivedStatus = status;
        return [makeConvention()];
      },
    });
    const { server, handlers } = captureTools();
    registerGetConventions(server, client);
    const result = await handlers.get('get_conventions')!({
      owner: 'acme',
      repo: 'web',
      status: 'accepted',
    });
    expect(receivedStatus).toBe('accepted');
    const payload = parse<{ conventions: { rule: string; status: string }[] }>(result);
    expect(payload.conventions).toEqual([
      {
        rule: 'use tabs',
        category: 'style',
        evidence: { file: 'a.ts', line: '1', code: 'x' },
        confidence: 0.9,
        status: 'accepted',
      },
    ]);
  });
});
