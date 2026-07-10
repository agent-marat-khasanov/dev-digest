/** Shared test fixtures + fakes. Not a test suite (vitest only runs *.test.ts). */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  Agent,
  Convention,
  FindingRecord,
  PrMeta,
  Repo,
  ReviewRecord,
  RunSummary,
} from '@devdigest/shared';
import type { DevDigestClient } from '../client.js';
import type { ToolResult } from '../errors.js';

export function fakeClient(
  overrides: Partial<Record<keyof DevDigestClient, unknown>> = {},
): DevDigestClient {
  const base = {
    baseUrl: 'http://test',
    runTimeoutMs: 180_000,
    getAgents: async () => [],
    getRepos: async () => [],
    getPulls: async () => [],
    postReview: async () => ({ pr_id: 'pr', runs: [], reviews: [] }),
    getRuns: async () => [],
    getReviews: async () => [],
    getConventions: async () => [],
  };
  return { ...base, ...overrides } as unknown as DevDigestClient;
}

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

export function captureTools() {
  const handlers = new Map<string, ToolHandler>();
  const configs = new Map<string, Record<string, unknown>>();
  const server = {
    registerTool: (name: string, config: Record<string, unknown>, handler: ToolHandler) => {
      configs.set(name, config);
      handlers.set(name, handler);
    },
  } as unknown as McpServer;
  return { server, handlers, configs };
}

/** Parse a tool result's JSON text payload. */
export function parse<T = unknown>(result: ToolResult): T {
  return JSON.parse(result.content[0]!.text) as T;
}

export function text(result: ToolResult): string {
  return result.content[0]!.text;
}

// ---- fixtures ----

export function makeRepo(o: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-1',
    workspace_id: 'ws-1',
    owner: 'acme',
    name: 'web',
    full_name: 'acme/web',
    default_branch: 'main',
    clone_path: null,
    last_polled_at: null,
    created_by: null,
    ...o,
  };
}

export function makePr(o: Partial<PrMeta> = {}): PrMeta {
  return {
    id: 'pr-1',
    number: 42,
    title: 'Add feature',
    author: 'dev',
    branch: 'feat',
    base: 'main',
    head_sha: 'abc',
    additions: 1,
    deletions: 0,
    files_count: 1,
    status: 'open',
    ...o,
  };
}

export function makeAgent(o: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    name: 'Security',
    description: '',
    provider: 'anthropic',
    model: 'claude',
    system_prompt: 'x',
    enabled: true,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
    ...o,
  };
}

export function makeFinding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: 'f-1',
    severity: 'WARNING',
    category: 'bug',
    title: 'Off-by-one',
    file: 'src/a.ts',
    start_line: 10,
    end_line: 12,
    rationale: 'because',
    suggestion: null,
    confidence: 0.8,
    review_id: 'rev-1',
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

export function makeReview(o: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: 'rev-1',
    pr_id: 'pr-1',
    agent_id: 'agent-1',
    run_id: 'run-1',
    agent_name: 'Security',
    kind: 'review',
    verdict: 'comment',
    summary: null,
    score: 80,
    model: 'claude',
    created_at: '2026-07-03T00:00:00Z',
    findings: [],
    ...o,
  };
}

export function makeRun(o: Partial<RunSummary> = {}): RunSummary {
  return {
    run_id: 'run-1',
    agent_id: 'agent-1',
    agent_name: 'Security',
    provider: 'anthropic',
    model: 'claude',
    status: 'done',
    error: null,
    duration_ms: 100,
    tokens_in: 1,
    tokens_out: 1,
    cost_usd: 0,
    findings_count: 0,
    grounding: null,
    ran_at: '2026-07-03T00:00:00Z',
    score: 80,
    blockers: 0,
    sev_critical: 0,
    sev_warning: 0,
    sev_suggestion: 0,
    ...o,
  };
}
