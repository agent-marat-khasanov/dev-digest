/**
 * DevDigestClient — thin, typed wrapper over the DevDigest REST API.
 *
 * The MCP server owns no domain logic: every capability is a call to an existing
 * endpoint. Responses are validated with the shared Zod contracts at this
 * boundary, so an API shape drift fails loudly here instead of surfacing as
 * `undefined` deep in a mapper.
 *
 * Security: only server-issued UUIDs (repoId/prId) are ever interpolated into
 * URL paths; untrusted owner/repo/agent strings are matched in memory (see
 * resolve.ts), never placed in a path. Path segments are encoded regardless.
 */
import { z } from 'zod';
import {
  Agent,
  Convention,
  type ConventionStatus,
  PrMeta,
  Repo,
  ReviewRecord,
  ReviewRunResponse,
  type RunRequest,
  RunSummary,
} from '@devdigest/shared';
import { ApiError } from './errors.js';

const DEFAULT_BASE_URL = 'http://localhost:3001';
const DEFAULT_RUN_TIMEOUT_MS = 180_000;
/** Per-request network timeout — distinct from the overall run-wait timeout. */
const REQUEST_TIMEOUT_MS = 15_000;

export interface DevDigestClientOptions {
  baseUrl?: string;
  runTimeoutMs?: number;
}

export class DevDigestClient {
  readonly baseUrl: string;
  readonly runTimeoutMs: number;

  constructor(opts: DevDigestClientOptions = {}) {
    const base = opts.baseUrl ?? process.env.DEVDIGEST_API_URL ?? DEFAULT_BASE_URL;
    this.baseUrl = base.replace(/\/+$/, '');
    this.runTimeoutMs =
      opts.runTimeoutMs ?? Number(process.env.DEVDIGEST_RUN_TIMEOUT_MS ?? DEFAULT_RUN_TIMEOUT_MS);
  }

  private async request<S extends z.ZodTypeAny>(
    schema: S,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<z.output<S>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(
        0,
        '',
        `cannot reach DevDigest API at ${this.baseUrl} — is the server running? (./scripts/dev.sh)`,
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ApiError(res.status, text, `DevDigest API ${method} ${path} returned ${res.status}`);
    }
    return schema.parse(await res.json());
  }

  getAgents(): Promise<Agent[]> {
    return this.request(z.array(Agent), 'GET', '/agents');
  }

  getRepos(): Promise<Repo[]> {
    return this.request(z.array(Repo), 'GET', '/repos');
  }

  /** Lists PRs for a repo; the server syncs open + recently merged/closed PRs from GitHub (auto-import). */
  getPulls(repoId: string): Promise<PrMeta[]> {
    return this.request(z.array(PrMeta), 'GET', `/repos/${encodeURIComponent(repoId)}/pulls`);
  }

  postReview(prId: string, body: RunRequest): Promise<ReviewRunResponse> {
    return this.request(
      ReviewRunResponse,
      'POST',
      `/pulls/${encodeURIComponent(prId)}/review`,
      body,
    );
  }

  getRuns(prId: string): Promise<RunSummary[]> {
    return this.request(z.array(RunSummary), 'GET', `/pulls/${encodeURIComponent(prId)}/runs`);
  }

  getReviews(prId: string): Promise<ReviewRecord[]> {
    return this.request(z.array(ReviewRecord), 'GET', `/pulls/${encodeURIComponent(prId)}/reviews`);
  }

  getConventions(repoId: string, status?: ConventionStatus): Promise<Convention[]> {
    const qs = status ? `?${new URLSearchParams({ status }).toString()}` : '';
    return this.request(
      z.array(Convention),
      'GET',
      `/repos/${encodeURIComponent(repoId)}/conventions${qs}`,
    );
  }
}
