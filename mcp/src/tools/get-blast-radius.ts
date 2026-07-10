import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DevDigestClient } from '../client.js';
import { toolText } from '../errors.js';

const NOT_IMPLEMENTED = 'Blast radius analysis is not yet implemented (planned for a future lesson).';

/**
 * STUB — the input shape is the stable interface for a future lesson. Makes NO
 * API call (the underlying RepoIntelService.getBlastRadius has no HTTP route yet).
 * `client` is accepted for a uniform registration signature but intentionally unused.
 */
export function registerGetBlastRadius(server: McpServer, _client: DevDigestClient): void {
  server.registerTool(
    'get_blast_radius',
    {
      description: 'Analyze the blast radius of a PR\'s changes (not yet implemented).',
      inputSchema: {
        owner: z.string().min(1).describe('repository owner'),
        repo: z.string().min(1).describe('repository name'),
        pr_number: z.number().int().positive().describe('GitHub PR number'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => toolText(NOT_IMPLEMENTED),
  );
}
