import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { RunRequest } from '@devdigest/shared';
import type { DevDigestClient } from '../client.js';
import { resolveAgentSelection, resolvePrId, resolveRepoId } from '../resolve.js';
import { buildVerdict } from '../format.js';
import { errText, toolError, toolText } from '../errors.js';

const TERMINAL = new Set(['done', 'failed', 'cancelled']);
const POLL_INTERVAL_MS = 2_500;

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface WaitOptions {
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * Poll run statuses until every target run reaches a terminal state
 * (done | failed | cancelled), or the client's run timeout elapses.
 * Returns runId -> last-seen status, or null on timeout. `sleep`/`now` are
 * injectable so tests need no real time.
 */
export async function waitForTerminal(
  client: DevDigestClient,
  prId: string,
  targetRunIds: string[],
  opts: WaitOptions = {},
): Promise<Map<string, string | null> | null> {
  const pollIntervalMs = opts.pollIntervalMs ?? POLL_INTERVAL_MS;
  const sleep = opts.sleep ?? realSleep;
  const now = opts.now ?? Date.now;
  const deadline = now() + client.runTimeoutMs;
  const targets = new Set(targetRunIds);

  for (;;) {
    const rows = await client.getRuns(prId);
    const statuses = new Map<string, string | null>();
    for (const r of rows) if (targets.has(r.run_id)) statuses.set(r.run_id, r.status);

    const allTerminal = targetRunIds.every((id) => {
      const s = statuses.get(id);
      return s != null && TERMINAL.has(s);
    });
    if (allTerminal) return statuses;
    if (now() >= deadline) return null;
    await sleep(pollIntervalMs);
  }
}

export function registerRunAgentOnPullRequest(server: McpServer, client: DevDigestClient): void {
  server.registerTool(
    'run_agent_on_pull_request',
    {
      description:
        'Run a review agent on a GitHub PR and return the verdict and findings. Blocks until the run finishes.',
      inputSchema: {
        owner: z.string().min(1).describe('repository owner'),
        repo: z.string().min(1).describe('repository name'),
        pr_number: z.number().int().positive().describe('GitHub PR number'),
        agent: z.string().min(1).describe("agent name, or 'all' to run every enabled agent"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ owner, repo, pr_number, agent }) => {
      try {
        const repoId = await resolveRepoId(client, owner, repo);
        const prId = await resolvePrId(client, repoId, pr_number);
        const selection = await resolveAgentSelection(client, agent);
        const body: RunRequest = 'all' in selection ? { all: true } : { agentId: selection.agentId };

        const { runs } = await client.postReview(prId, body);
        if (runs.length === 0) {
          return toolError('no agents were triggered — ensure the agent is enabled, or pass agent="all"');
        }

        const statuses = await waitForTerminal(
          client,
          prId,
          runs.map((r) => r.run_id),
        );
        if (statuses === null) {
          return toolError(
            `review still running after ${client.runTimeoutMs}ms — call get_findings for ${owner}/${repo} #${pr_number} later to fetch results`,
          );
        }

        const result = buildVerdict(await client.getReviews(prId));

        const notComplete = runs
          .filter((r) => statuses.get(r.run_id) !== 'done')
          .map((r) => `${r.agent_name} (${statuses.get(r.run_id) ?? 'unknown'})`);
        const payload = notComplete.length
          ? { ...result, warnings: `runs that did not complete cleanly: ${notComplete.join(', ')}` }
          : result;

        return toolText(payload);
      } catch (err) {
        return toolError(errText(err));
      }
    },
  );
}
