import { describe, expect, it } from 'vitest';
import { registerListAgents } from '../tools/list-agents.js';
import { ApiError } from '../errors.js';
import { captureTools, fakeClient, makeAgent, parse } from './helpers.js';

describe('list_agents handler', () => {
  it('returns a compact agent list', async () => {
    const client = fakeClient({
      getAgents: async () => [makeAgent({ id: 'a1', name: 'Security', provider: 'anthropic', model: 'claude' })],
    });
    const { server, handlers } = captureTools();
    registerListAgents(server, client);
    const result = await handlers.get('list_agents')!({});
    expect(result.isError).toBeUndefined();
    expect(parse(result)).toEqual([
      { id: 'a1', name: 'Security', provider: 'anthropic', model: 'claude', enabled: true },
    ]);
  });

  it('returns an actionable isError when the API is unreachable', async () => {
    const client = fakeClient({
      getAgents: async () => {
        throw new ApiError(0, '', 'cannot reach DevDigest API at http://test — is the server running? (./scripts/dev.sh)');
      },
    });
    const { server, handlers } = captureTools();
    registerListAgents(server, client);
    const result = await handlers.get('list_agents')!({});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/is the server running/);
  });
});
