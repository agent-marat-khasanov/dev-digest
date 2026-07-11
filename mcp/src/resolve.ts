/**
 * Translate GitHub identifiers (owner/repo/pr_number/agent) into DevDigest ids by
 * matching against server-returned lists. Untrusted strings are compared in
 * memory here and never reach a URL path. Every miss throws a ResolutionError
 * whose message names the next step (principle "errors lead forward").
 */
import type { DevDigestClient } from './client.js';
import { ResolutionError } from './errors.js';

export async function resolveRepoId(
  client: DevDigestClient,
  owner: string,
  repo: string,
): Promise<string> {
  const repos = await client.getRepos();
  const fullName = `${owner}/${repo}`.toLowerCase();
  const match = repos.find(
    (r) =>
      r.full_name.toLowerCase() === fullName ||
      (r.owner.toLowerCase() === owner.toLowerCase() && r.name.toLowerCase() === repo.toLowerCase()),
  );
  if (!match) {
    throw new ResolutionError(
      `repo '${owner}/${repo}' not found in DevDigest — register it first (POST /repos or the Repositories UI), then retry`,
    );
  }
  return match.id;
}

export async function resolvePrId(
  client: DevDigestClient,
  repoId: string,
  prNumber: number,
): Promise<string> {
  // getPulls triggers the server's best-effort GitHub sync (auto-import).
  const pulls = await client.getPulls(repoId);
  const match = pulls.find((p) => p.number === prNumber && p.id);
  if (!match?.id) {
    throw new ResolutionError(
      `PR #${prNumber} not found for this repo — it may be outside the sync window (open + recently merged/closed) or GITHUB_TOKEN is not configured server-side`,
    );
  }
  return match.id;
}

export type AgentSelection = { all: true } | { agentId: string };

export async function resolveAgentSelection(
  client: DevDigestClient,
  agent: string,
): Promise<AgentSelection> {
  if (agent.toLowerCase() === 'all') return { all: true };
  const agents = await client.getAgents();
  const match = agents.find((a) => a.name.toLowerCase() === agent.toLowerCase());
  if (!match) {
    const names = agents.map((a) => a.name).join(', ') || '(none)';
    throw new ResolutionError(
      `agent '${agent}' not found — call list_agents to see available agents (have: ${names})`,
    );
  }
  return { agentId: match.id };
}
