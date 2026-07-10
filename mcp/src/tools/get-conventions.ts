import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DevDigestClient } from '../client.js';
import { resolveRepoId } from '../resolve.js';
import { compactConvention } from '../format.js';
import { errText, toolError, toolText } from '../errors.js';

export function registerGetConventions(server: McpServer, client: DevDigestClient): void {
  server.registerTool(
    'get_conventions',
    {
      description: 'List a repo\'s extracted coding conventions, optionally filtered by status.',
      inputSchema: {
        owner: z.string().min(1).describe('repository owner'),
        repo: z.string().min(1).describe('repository name'),
        status: z
          .enum(['pending', 'accepted', 'rejected'])
          .optional()
          .describe('filter by review status'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ owner, repo, status }) => {
      try {
        const repoId = await resolveRepoId(client, owner, repo);
        const conventions = await client.getConventions(repoId, status);
        return toolText({ conventions: conventions.map(compactConvention) });
      } catch (err) {
        return toolError(errText(err));
      }
    },
  );
}
