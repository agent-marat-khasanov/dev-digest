/**
 * DevDigest MCP server — a local stdio server exposing 5 tools over the DevDigest
 * REST API. Launched on demand (inspector, `.mcp.json`, or `claude mcp add`),
 * never by the app scripts. Requires the DevDigest API to be running
 * (./scripts/dev.sh).
 *
 * This is the process entry point — it owns the side effects (validate config,
 * build the client, connect stdio). The server itself is built by the pure
 * `createServer` factory in server.ts.
 *
 * NOTE: stdio transport uses stdout for the JSON-RPC protocol — do NOT write to
 * stdout (no console.log). Diagnostics and startup errors go to stderr.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DevDigestClient } from './client.js';
import { loadConfig } from './config.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const client = new DevDigestClient(loadConfig());
  const server = createServer(client);
  await server.connect(new StdioServerTransport());
}

main().catch((err: unknown) => {
  process.stderr.write(
    `devdigest-mcp failed to start: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
