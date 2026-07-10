#!/usr/bin/env tsx
/**
 * devdigest CLI — pre-push review of the WORKING TREE (before `git push`).
 *
 *   devdigest review --mode working [--agent <name>]
 *
 * Takes the working-copy `git diff` (uncommitted changes in the repo where the
 * command runs) and sends it to the SAME product reviewer via POST
 * /review/working, then prints the structured findings. Requires the DevDigest
 * API to be running (./scripts/dev.sh) and an LLM key configured server-side.
 *
 * `--mode working` is the only mode today; `staged` / `branch` are left as room
 * for the future.
 *
 * Runtime note: this file imports ONLY types from `@devdigest/shared` (erased at
 * build time) and talks to the API with a plain `fetch`, so it runs as a
 * portable `tsx` bin from ANY working directory — it does NOT depend on the
 * package's `@devdigest/shared` path alias being resolvable at runtime (which
 * only holds when cwd is the mcp/ package). Unlike src/index.ts (the stdio MCP
 * server, which must keep stdout clean for JSON-RPC), stdout here is the
 * user-facing output channel.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Finding, Review, Severity } from '@devdigest/shared';

const execFileAsync = promisify(execFile);

const API_URL = (process.env.DEVDIGEST_API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
/** LLM review can take a while — well beyond a metadata-fetch timeout. */
const REVIEW_TIMEOUT_MS = Number(process.env.DEVDIGEST_RUN_TIMEOUT_MS ?? 180_000);

interface Args {
  mode: 'working';
  agent?: string;
}

function parseArgs(argv: string[]): Args {
  const [command, ...rest] = argv;
  if (command !== 'review') {
    throw new Error(
      `unknown command "${command ?? ''}" — usage: devdigest review --mode working [--agent <name>]`,
    );
  }
  let mode: string | undefined;
  let agent: string | undefined;
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    if (flag === '--mode') mode = rest[(i += 1)];
    else if (flag === '--agent') agent = rest[(i += 1)];
    else throw new Error(`unknown argument "${flag}"`);
  }
  if (mode !== 'working') throw new Error(`--mode must be "working" (got "${mode ?? ''}")`);
  return { mode: 'working', agent };
}

/** Working-tree diff = uncommitted changes. No shell (execFile), bounded buffer. */
async function getWorkingDiff(): Promise<string> {
  const { stdout } = await execFileAsync('git', ['diff'], { maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}

async function requestReview(diff: string, agent?: string): Promise<Review> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REVIEW_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/review/working`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(agent ? { diff, agent } : { diff }),
      signal: controller.signal,
    });
  } catch {
    throw new Error(
      `cannot reach DevDigest API at ${API_URL} — is the server running? (./scripts/dev.sh)`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DevDigest API returned ${res.status}${text ? ` — ${extractMessage(text)}` : ''}`);
  }
  return (await res.json()) as Review;
}

/** Pull the human message out of the API's `{ error: { message } }` envelope. */
function extractMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    return parsed.error?.message ?? body;
  } catch {
    return body;
  }
}

const SEVERITY_ORDER: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

function printReview(review: Review): void {
  const findings = [...review.findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  process.stdout.write(`\nVerdict: ${review.verdict}   Score: ${review.score}/100\n`);
  if (review.summary) process.stdout.write(`${review.summary}\n`);

  if (findings.length === 0) {
    process.stdout.write('\nNo findings — nothing blocking. ✅\n');
    return;
  }

  process.stdout.write(`\n${findings.length} finding(s):\n`);
  for (const f of findings) printFinding(f);
}

function printFinding(f: Finding): void {
  const range =
    f.end_line && f.end_line !== f.start_line ? `${f.start_line}-${f.end_line}` : `${f.start_line}`;
  process.stdout.write(`\n[${f.severity}] ${f.title}\n`);
  process.stdout.write(
    `  ${f.file}:${range} · ${f.category} · confidence ${(f.confidence * 100).toFixed(0)}%\n`,
  );
  if (f.rationale) process.stdout.write(`  ${f.rationale}\n`);
  if (f.suggestion) process.stdout.write(`  → ${f.suggestion}\n`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const diff = await getWorkingDiff();
  if (diff.trim().length === 0) {
    process.stderr.write('No working-tree changes to review (git diff is empty).\n');
    process.exit(1);
  }
  printReview(await requestReview(diff, args.agent));
}

main().catch((err: unknown) => {
  process.stderr.write(`devdigest review failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
