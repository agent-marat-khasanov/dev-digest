import { describe, expect, it } from 'vitest';
import { resolveAgentSelection, resolvePrId, resolveRepoId } from '../resolve.js';
import { ResolutionError } from '../errors.js';
import { fakeClient, makeAgent, makePr, makeRepo } from './helpers.js';

describe('resolveRepoId', () => {
  it('matches on owner/name case-insensitively', async () => {
    const client = fakeClient({ getRepos: async () => [makeRepo({ id: 'r9', owner: 'Acme', name: 'Web' })] });
    await expect(resolveRepoId(client, 'acme', 'web')).resolves.toBe('r9');
  });

  it('throws an actionable error naming POST /repos when not found', async () => {
    const client = fakeClient({ getRepos: async () => [] });
    await expect(resolveRepoId(client, 'acme', 'web')).rejects.toBeInstanceOf(ResolutionError);
    await expect(resolveRepoId(client, 'acme', 'web')).rejects.toThrow(/register it first/);
  });
});

describe('resolvePrId', () => {
  it('finds the pull by number', async () => {
    const client = fakeClient({ getPulls: async () => [makePr({ id: 'pr-42', number: 42 })] });
    await expect(resolvePrId(client, 'repo-1', 42)).resolves.toBe('pr-42');
  });

  it('throws mentioning the sync window / GITHUB_TOKEN when absent', async () => {
    const client = fakeClient({ getPulls: async () => [makePr({ number: 7 })] });
    await expect(resolvePrId(client, 'repo-1', 42)).rejects.toThrow(/sync window|GITHUB_TOKEN/);
  });

  it('throws when the matching pull has no id', async () => {
    const client = fakeClient({ getPulls: async () => [makePr({ id: null, number: 42 })] });
    await expect(resolvePrId(client, 'repo-1', 42)).rejects.toBeInstanceOf(ResolutionError);
  });
});

describe('resolveAgentSelection', () => {
  it('returns {all:true} for the "all" sentinel (case-insensitive), without listing agents', async () => {
    let called = false;
    const client = fakeClient({
      getAgents: async () => {
        called = true;
        return [];
      },
    });
    await expect(resolveAgentSelection(client, 'ALL')).resolves.toEqual({ all: true });
    expect(called).toBe(false);
  });

  it('resolves an agent id by name', async () => {
    const client = fakeClient({ getAgents: async () => [makeAgent({ id: 'a7', name: 'Security' })] });
    await expect(resolveAgentSelection(client, 'security')).resolves.toEqual({ agentId: 'a7' });
  });

  it('throws an error that points to list_agents and lists available names', async () => {
    const client = fakeClient({ getAgents: async () => [makeAgent({ name: 'Security' })] });
    await expect(resolveAgentSelection(client, 'Perf')).rejects.toThrow(/call list_agents/);
    await expect(resolveAgentSelection(client, 'Perf')).rejects.toThrow(/Security/);
  });
});
