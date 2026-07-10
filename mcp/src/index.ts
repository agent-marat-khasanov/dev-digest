/**
 * DevDigest MCP server — a local stdio server exposing 5 tools over the DevDigest
 * REST API. Launched on demand (inspector or `claude mcp add`), never by the app
 * scripts. Requires the DevDigest API to be running (./scripts/dev.sh).
 *
 * NOTE: stdio transport uses stdout for the JSON-RPC protocol — do NOT write to
 * stdout (no console.log). Diagnostics, if ever needed, go to stderr.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DevDigestClient } from './client.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerRunAgentOnPullRequest } from './tools/run-agent-on-pull-request.js';
import { registerGetFindings } from './tools/get-findings.js';
import { registerGetConventions } from './tools/get-conventions.js';
import { registerGetBlastRadius } from './tools/get-blast-radius.js';

const client = new DevDigestClient();
const server = new McpServer({ name: 'devdigest', version: '0.1.0' });

registerListAgents(server, client);
registerRunAgentOnPullRequest(server, client);
registerGetFindings(server, client);
registerGetConventions(server, client);
registerGetBlastRadius(server, client);

await server.connect(new StdioServerTransport());
