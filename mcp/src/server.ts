/**
 * MCP server factory. Pure and side-effect-free: it builds an `McpServer` and
 * registers all 5 tools against the given client — no client construction, no
 * transport, no `connect()`. Process wiring lives in index.ts. Keeping this a
 * plain factory makes the tool set unit-testable without touching stdio.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DevDigestClient } from './client.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerRunAgentOnPullRequest } from './tools/run-agent-on-pull-request.js';
import { registerGetFindings } from './tools/get-findings.js';
import { registerGetConventions } from './tools/get-conventions.js';
import { registerGetBlastRadius } from './tools/get-blast-radius.js';

export function createServer(client: DevDigestClient): McpServer {
  const server = new McpServer({ name: 'devdigest', version: '0.1.0' });

  registerListAgents(server, client);
  registerRunAgentOnPullRequest(server, client);
  registerGetFindings(server, client);
  registerGetConventions(server, client);
  registerGetBlastRadius(server, client);

  return server;
}
