import { describe, it, expect } from 'vitest';
import type { Container } from '../../platform/container.js';
import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { OnboardingService, type Logger } from './service.js';

/**
 * Hermetic unit tests for OnboardingService. Reaches the outside world only
 * through `container.repoRepo` / `container.repoIntel` / `container.llm` /
 * `container.db` (all faked) — no real Postgres, no fs (clonePath stays
 * null so `deriveCommands` short-circuits), no network. Exercises
 * `regenerate()` because it always runs `generateAndStore` (bypassing the
 * SHA-cache read path, which is not under test here).
 *
 * Covers:
 * - AC-2 — the model-mode reading path is re-sorted to rank order even when
 *   the model emits items out of order; a validated-but-unranked path sorts
 *   last.
 * - AC-6 — the persisted/returned tour always has exactly the five
 *   mandatory sections, in fixed order.
 * - AC-19 — a null `costUsd` from the provider is logged as null and does
 *   NOT throw / fail generation.
 */

const WS = 'ws1';
const REPO = 'repo1';

interface FakeLlmOpts {
  fixture: unknown;
  costUsd: number | null;
}

class FakeLlm implements Pick<LLMProvider, 'completeStructured'> {
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const parsed = req.schema.safeParse(this.opts.fixture);
    if (!parsed.success) {
      throw new Error(`fixture failed schema: ${parsed.error.message}`);
    }
    return {
      data: parsed.data,
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: this.opts.costUsd,
      raw: '{}',
      attempts: 1,
    };
  }

  constructor(private opts: FakeLlmOpts) {}
}

function makeContainer(opts: { llmFixture: unknown; costUsd: number | null }): Container {
  const insertedRows: unknown[] = [];
  return {
    repoRepo: {
      // Real (but nonexistent) path — proves gatherFacts/deriveCommands stay
      // hermetic: the guarded fs read fails closed (returns []) rather than
      // throwing, so tests need no real clone on disk.
      getById: async () => ({ id: REPO, clonePath: '/tmp/onboarding-test-fixture-does-not-exist' }),
    },
    repoIntel: {
      getIndexState: async () => ({
        status: 'full',
        filesIndexed: 3,
        filesSkipped: 0,
        durationMs: 5,
        repoId: REPO,
        lastIndexedSha: 'sha1',
        indexerVersion: 1,
        updatedAt: new Date(),
      }),
      getTopFilesByRank: async () => ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      getCriticalPaths: async () => [['src/a.ts', 'src/d.ts']],
      getRepoMap: async () => ({ text: 'map', tokens: 5, cached: false }),
      getReachableFacts: async () => ({}),
    },
    llm: async () => new FakeLlm({ fixture: opts.llmFixture, costUsd: opts.costUsd }) as unknown as LLMProvider,
    db: {
      // resolveFeatureModel reads workspace settings — no override configured.
      select: () => ({ from: () => ({ where: async () => [] }) }),
      // OnboardingRepository.upsert
      insert: () => ({
        values: (v: unknown) => ({
          onConflictDoUpdate: () => ({
            returning: async () => {
              const row = { id: 'row1', repoId: REPO, generatedAt: new Date(), ...(v as object) };
              insertedRows.push(row);
              return [row];
            },
          }),
        }),
      }),
    },
  } as unknown as Container;
}

function baseFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    architecture: { body: 'arch body', diagram: null },
    critical_paths: { body: 'critical body', items: [{ path: 'src/a.ts', role: 'entry' }] },
    reading_path: {
      body: 'reading body',
      items: [
        { path: 'src/c.ts', why: 'third by rank' },
        { path: 'src/a.ts', why: 'first by rank' },
        { path: 'src/b.ts', why: 'second by rank' },
      ],
    },
    first_tasks: { body: 'first tasks body' },
    run_locally: { body: 'run locally body' },
    ...overrides,
  };
}

describe('OnboardingService.regenerate — reading path rank re-sort (AC-2)', () => {
  it('re-sorts model-emitted reading-path items back into rank order, even when the model emitted them out of order', async () => {
    const container = makeContainer({ llmFixture: baseFixture(), costUsd: 0.01 });
    const service = new OnboardingService(container);

    const tour = await service.regenerate(WS, REPO);

    const readingSection = tour.sections.find((s) => s.id === 'reading_path')!;
    expect(readingSection.links).toEqual([
      { label: 'first by rank', path: 'src/a.ts' },
      { label: 'second by rank', path: 'src/b.ts' },
      { label: 'third by rank', path: 'src/c.ts' },
    ]);
  });

  it('places a validated path that is absent from the rank list (topFiles) last, and drops paths absent from the facts entirely', async () => {
    const fixture = baseFixture({
      reading_path: {
        body: 'reading body',
        items: [
          // src/d.ts is a real fact (from a critical path) but NOT in topFiles → sorts last.
          { path: 'src/d.ts', why: 'unranked but real' },
          { path: 'src/b.ts', why: 'second by rank' },
          // src/hallucinated.ts is not present anywhere in the facts → dropped.
          { path: 'src/hallucinated.ts', why: 'made up' },
          { path: 'src/a.ts', why: 'first by rank' },
        ],
      },
    });
    const container = makeContainer({ llmFixture: fixture, costUsd: 0.01 });
    const service = new OnboardingService(container);

    const tour = await service.regenerate(WS, REPO);

    const readingSection = tour.sections.find((s) => s.id === 'reading_path')!;
    expect(readingSection.links).toEqual([
      { label: 'first by rank', path: 'src/a.ts' },
      { label: 'second by rank', path: 'src/b.ts' },
      { label: 'unranked but real', path: 'src/d.ts' },
    ]);
  });
});

describe('OnboardingService.regenerate — five fixed sections (AC-6)', () => {
  it('returns exactly the five mandatory sections in fixed order on a successful model generation', async () => {
    const container = makeContainer({ llmFixture: baseFixture(), costUsd: 0.01 });
    const service = new OnboardingService(container);

    const tour = await service.regenerate(WS, REPO);

    expect(tour.sections.map((s) => s.id)).toEqual([
      'architecture',
      'critical_paths',
      'run_locally',
      'reading_path',
      'first_tasks',
    ]);
    expect(tour.sections).toHaveLength(5);
  });
});

describe('OnboardingService.regenerate — null cost (AC-19)', () => {
  it('logs the cost as null and does not throw when the provider reports no cost', async () => {
    const container = makeContainer({ llmFixture: baseFixture(), costUsd: null });
    const service = new OnboardingService(container);

    const loggedCalls: { obj: unknown; msg?: string }[] = [];
    const logger: Logger = {
      info: (obj, msg) => loggedCalls.push({ obj, msg }),
    };

    const tour = await expect(service.regenerate(WS, REPO, logger)).resolves.toBeDefined();
    void tour;

    const generationLog = loggedCalls.find((c) => c.msg === 'onboarding: tour generated');
    expect(generationLog).toBeDefined();
    expect((generationLog!.obj as { cost_usd: unknown }).cost_usd).toBeNull();
  });

  it('still returns a successful "model" mode tour with cost_usd null in the response', async () => {
    const container = makeContainer({ llmFixture: baseFixture(), costUsd: null });
    const service = new OnboardingService(container);

    const tour = await service.regenerate(WS, REPO);

    expect(tour.mode).toBe('model');
    expect(tour.generated?.cost_usd).toBeNull();
  });
});
