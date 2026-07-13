import { describe, it, expect } from 'vitest';
import type { BlastRadius, SmartDiff, StructuredRequest, StructuredResult } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import type { PullRow, RepoRow } from '../../db/rows.js';
import type { Container } from '../../platform/container.js';
import { BriefService } from './service.js';

/**
 * Hermetic unit test for `BriefService.generateAndStore`'s AC-22 edge: the
 * provider reporting no cost (`costUsd: null`) must persist/expose
 * `generated.cost_usd` as `null` and must NOT throw. Everything the service
 * touches (db, reviewRepo, repoIntel, github, agentsRepo, contextRepo, llm)
 * is faked — no real Postgres, no network, no real model.
 */

const WS = 'ws1';
const PR_ID = 'pr1';
const REPO_ID = 'repo1';

function makePull(): PullRow {
  return {
    id: PR_ID,
    workspaceId: WS,
    repoId: REPO_ID,
    number: 1,
    title: 'Add rate limiting',
    author: 'marisa.koch',
    branch: 'feat/rl',
    base: 'main',
    headSha: 'sha-head',
    lastReviewedSha: null,
    additions: 10,
    deletions: 2,
    filesCount: 1,
    status: 'needs_review',
    body: null,
    openedAt: null,
    updatedAt: null,
  } as unknown as PullRow;
}

function makeRepo(): RepoRow {
  return {
    id: REPO_ID,
    workspaceId: WS,
    owner: 'acme',
    name: 'payments-api',
    fullName: 'acme/payments-api',
    defaultBranch: 'main',
    clonePath: null,
    lastPolledAt: null,
    createdBy: null,
    createdAt: null,
  } as unknown as RepoRow;
}

const EMPTY_SMART_DIFF: SmartDiff = {
  groups: [],
  split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
};

const EMPTY_BLAST: BlastRadius = {
  changed_symbols: [],
  downstream: [],
  summary: 'no changes',
};

/** A hand-rolled `completeStructured` that reports NO cost (AC-22). */
class NoCostLLMProvider {
  readonly id = 'openai' as const;
  calls: unknown[] = [];
  constructor(private fixture: unknown) {}
  async listModels() {
    return [];
  }
  async complete() {
    throw new Error('not used');
  }
  async completeStructured<Tout>(req: StructuredRequest<Tout>): Promise<StructuredResult<Tout>> {
    this.calls.push(req);
    const parsed = req.schema.safeParse(this.fixture);
    if (!parsed.success) throw new Error(`fixture failed schema: ${parsed.error.message}`);
    return {
      data: parsed.data,
      model: req.model,
      tokensIn: 42,
      tokensOut: 7,
      costUsd: null, // <-- AC-22: provider reports no cost
      raw: JSON.stringify(this.fixture),
      attempts: 1,
    };
  }
  async embed(texts: string[]) {
    return texts.map(() => []);
  }
}

function makeContainer(llm: NoCostLLMProvider, upserted: { json: unknown; headSha: string }[]): Container {
  const fakeDb = {
    select: (_cols?: unknown) => ({
      from: (table: unknown) => ({
        where: async () => {
          if (table === t.settings) return []; // no workspace override -> registry default
          return [];
        },
      }),
    }),
    insert: (_table: unknown) => ({
      values: (vals: { prId: string; json: unknown; headSha: string }) => ({
        onConflictDoUpdate: (_arg: unknown) => ({
          returning: async () => {
            upserted.push({ json: vals.json, headSha: vals.headSha });
            return [{ prId: vals.prId, json: vals.json, headSha: vals.headSha }];
          },
        }),
      }),
    }),
  };

  return {
    db: fakeDb,
    reviewRepo: {
      getPull: async () => makePull(),
      getRepo: async () => makeRepo(),
      getPrFiles: async () => [],
      reviewsForPull: async () => [],
    },
    repoIntel: {
      getBlastRadius: async () => ({ changedSymbols: [], callers: [], factsByFile: {} }),
      getReachableFacts: async () => ({}),
    },
    git: {
      diff: async () => {
        throw new Error('no real git in tests');
      },
    },
    github: async () => ({ getIssue: async () => ({ title: 't', body: null }) }),
    agentsRepo: { list: async () => [] },
    contextRepo: { listAgentContext: async () => [], skillInheritedContext: async () => [] },
    tokenizer: { count: (text: string) => text.length },
    llm: async () => llm,
  } as unknown as Container;
}

describe('BriefService.generateAndStore — cost-null tolerance (AC-22)', () => {
  it('persists and returns generated.cost_usd as null (not throwing) when the provider reports no cost', async () => {
    const fixture = {
      what: 'Adds rate limiting',
      why: 'Prevent abuse of public endpoints',
      risk_level: 'low',
      risks: [],
      review_focus: [],
    };
    const llm = new NoCostLLMProvider(fixture);
    const upserted: { json: unknown; headSha: string }[] = [];
    const container = makeContainer(llm, upserted);

    const service = new BriefService(container);
    const result = await service.regenerate(WS, PR_ID);

    expect(result.generated?.cost_usd ?? null).toBeNull();
    expect(result.generated?.tokens_in).toBe(42);
    expect(result.generated?.tokens_out).toBe(7);

    // Persisted payload also carries a null cost, never a throw/omission.
    const last = upserted.at(-1);
    expect(last).toBeDefined();
    const payload = last!.json as { generated: { cost_usd: number | null } };
    expect(payload.generated.cost_usd).toBeNull();
  });
});
