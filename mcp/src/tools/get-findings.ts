import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DevDigestClient } from '../client.js';
import { resolvePrId, resolveRepoId } from '../resolve.js';
import { buildVerdict } from '../format.js';
import { errText, toolError, toolText } from '../errors.js';

export function registerGetFindings(server: McpServer, client: DevDigestClient): void {
  server.registerTool(
    'get_findings',
    {
      description: 'Get the latest persisted review verdict and findings for a GitHub PR.',
      inputSchema: {
        owner: z.string().min(1).describe('repository owner'),
        repo: z.string().min(1).describe('repository name'),
        pr_number: z.number().int().positive().describe('GitHub PR number'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ owner, repo, pr_number }) => {
      try {
        const repoId = await resolveRepoId(client, owner, repo);
        const prId = await resolvePrId(client, repoId, pr_number);
        const reviews = await client.getReviews(prId);
        if (!reviews.some((r) => r.kind === 'review')) {
          return toolError(
            `no reviews yet for PR #${pr_number} — run run_agent_on_pull_request first`,
          );
        }
        return toolText(buildVerdict(reviews));
      } catch (err) {
        return toolError(errText(err));
      }
    },
  );
}
