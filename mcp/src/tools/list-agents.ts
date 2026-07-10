import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DevDigestClient } from '../client.js';
import { compactAgent } from '../format.js';
import { errText, toolError, toolText } from '../errors.js';

export function registerListAgents(server: McpServer, client: DevDigestClient): void {
  server.registerTool(
    'list_agents',
    {
      description: 'List available review agents (id, name, provider, model, enabled).',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const agents = await client.getAgents();
        return toolText(agents.map(compactAgent));
      } catch (err) {
        return toolError(errText(err));
      }
    },
  );
}
