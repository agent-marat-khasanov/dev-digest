import type { OnboardingTour, TourSection } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { loadPromptTemplate, renderTemplate } from '../../platform/prompts.js';
import { gatherFacts, type TourFacts } from './facts.js';
import { TOUR_SECTIONS, buildSkeleton, validatePaths } from './sections.js';
import { OnboardingModelOutput, buildUserMessage } from './prompt.js';
import { OnboardingRepository, type OnboardingRow } from './repository.js';

/** Minimal structured logger (pino-compatible: (obj, msg)) for cost logging. */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
};

const DEFAULT_LANGUAGE = 'English';

/**
 * Onboarding tour service. Orchestrates:
 *   load repo → not-cloned/skeleton/model branching → SHA cache check →
 *   (cache miss) gatherFacts → completeStructured (model) or deterministic
 *   skeleton → upsert + return OnboardingTour.
 *
 * Mirrors the `intent` module's getIntent/recalculate/generateAndStore split
 * (`modules/intent/service.ts`) — `getTour` is cache-aware, `regenerate`
 * always bypasses the cache (AC-15/AC-24).
 */
export class OnboardingService {
  private repo: OnboardingRepository;

  constructor(private container: Container) {
    this.repo = new OnboardingRepository(container.db);
  }

  async getTour(workspaceId: string, repoId: string, logger?: Logger): Promise<OnboardingTour> {
    const repoRow = await this.container.repoRepo.getById(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    if (!repoRow.clonePath) return this.notAvailable(repoId, 'not_cloned');

    const indexState = await this.container.repoIntel.getIndexState(repoId);
    const cached = await this.repo.getByRepoId(repoId);
    if (cached && cached.sha !== null && cached.sha === indexState.lastIndexedSha) {
      return this.toTour(cached, indexState.filesIndexed, indexState.degradedReason ?? 'index_degraded');
    }

    const facts = await gatherFacts(this.container, workspaceId, repoId);
    return this.branch(workspaceId, repoId, facts, logger);
  }

  /**
   * Force a fresh generation, BYPASSING the SHA cache. Backs the explicit
   * `POST /repos/:id/tour/regenerate` (user-driven). Always re-gathers facts
   * and always (re)generates, per the same branching as `getTour`.
   */
  async regenerate(workspaceId: string, repoId: string, logger?: Logger): Promise<OnboardingTour> {
    const repoRow = await this.container.repoRepo.getById(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    if (!repoRow.clonePath) return this.notAvailable(repoId, 'not_cloned');

    const facts = await gatherFacts(this.container, workspaceId, repoId);
    return this.branch(workspaceId, repoId, facts, logger);
  }

  private async branch(
    workspaceId: string,
    repoId: string,
    facts: TourFacts,
    logger?: Logger,
  ): Promise<OnboardingTour> {
    if (facts.degraded || facts.indexStatus === 'degraded' || facts.indexStatus === 'failed') {
      return this.storeSkeleton(repoId, facts, facts.degradedReason ?? 'index_degraded');
    }

    try {
      return await this.generateAndStore(workspaceId, repoId, facts, logger);
    } catch {
      return this.storeSkeleton(repoId, facts, 'model_failed');
    }
  }

  /** Deterministic, facts-only fallback (AC-9/AC-11) — persisted, no model call. */
  private async storeSkeleton(repoId: string, facts: TourFacts, reason: string): Promise<OnboardingTour> {
    const sections = buildSkeleton(facts, reason);
    await this.repo.upsert(repoId, {
      sections,
      sha: facts.indexedSha,
      model: null,
      costUsd: null,
      tokensIn: null,
      tokensOut: null,
    });
    return {
      repo_id: repoId,
      mode: 'skeleton',
      reason,
      sections,
      index: { files_indexed: facts.filesIndexed, sha: facts.indexedSha },
      generated_at: new Date().toISOString(),
      generated: null,
    };
  }

  private notAvailable(repoId: string, reason: string): OnboardingTour {
    return {
      repo_id: repoId,
      mode: 'not_available',
      reason,
      sections: [],
      index: { files_indexed: 0, sha: null },
      generated_at: null,
      generated: null,
    };
  }

  /** Model generation — ONE completeStructured call (AC-5), never a fallback path itself. */
  private async generateAndStore(
    workspaceId: string,
    repoId: string,
    facts: TourFacts,
    logger?: Logger,
  ): Promise<OnboardingTour> {
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'onboarding');
    const llm = await this.container.llm(provider);

    const template = await loadPromptTemplate('onboarding.system.md');
    const systemPrompt = renderTemplate(template, {
      sections: TOUR_SECTIONS.map((s) => `- ${s.id}: ${s.title}`).join('\n'),
      language: DEFAULT_LANGUAGE,
    });

    const result = await llm.completeStructured({
      model,
      schema: OnboardingModelOutput,
      schemaName: 'OnboardingModelOutput',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: buildUserMessage(facts) },
      ],
    });

    const criticalItems = validatePaths(result.data.critical_paths.items, facts.allowedPaths);
    const readingItems = validatePaths(result.data.reading_path.items, facts.allowedPaths);

    const sections: TourSection[] = TOUR_SECTIONS.map(({ id, title }): TourSection => {
      switch (id) {
        case 'architecture':
          return {
            id,
            title,
            body: result.data.architecture.body,
            diagram: result.data.architecture.diagram,
            links: null,
            commands: null,
          };
        case 'critical_paths':
          return {
            id,
            title,
            body: result.data.critical_paths.body,
            diagram: null,
            links: criticalItems.length > 0
              ? criticalItems.map((i) => ({ label: i.role, path: i.path }))
              : null,
            commands: null,
          };
        case 'reading_path':
          return {
            id,
            title,
            body: result.data.reading_path.body,
            diagram: null,
            links: readingItems.length > 0
              ? readingItems.map((i) => ({ label: i.why, path: i.path }))
              : null,
            commands: null,
          };
        case 'first_tasks':
          return {
            id,
            title,
            body: result.data.first_tasks.body,
            diagram: null,
            links: null,
            commands: null,
          };
        case 'run_locally':
          // Commands are ALWAYS code-derived, regardless of any model output (AC-8).
          return {
            id,
            title,
            body: result.data.run_locally.body,
            diagram: null,
            links: null,
            commands: facts.commands.length > 0 ? facts.commands : null,
          };
      }
    });

    logger?.info(
      {
        cost_usd: result.costUsd,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        model: result.model,
      },
      'onboarding: tour generated',
    );

    await this.repo.upsert(repoId, {
      sections,
      sha: facts.indexedSha,
      model: result.model,
      costUsd: result.costUsd,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    });

    return {
      repo_id: repoId,
      mode: 'model',
      reason: null,
      sections,
      index: { files_indexed: facts.filesIndexed, sha: facts.indexedSha },
      generated_at: new Date().toISOString(),
      generated: {
        model: result.model,
        cost_usd: result.costUsd,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
      },
    };
  }

  private toTour(row: OnboardingRow, filesIndexed: number, skeletonReason: string): OnboardingTour {
    const sections = row.json as TourSection[];
    const mode: OnboardingTour['mode'] = row.model !== null ? 'model' : 'skeleton';
    return {
      repo_id: row.repoId,
      mode,
      reason: mode === 'model' ? null : skeletonReason,
      sections,
      index: { files_indexed: filesIndexed, sha: row.sha },
      generated_at: row.generatedAt.toISOString(),
      generated: mode === 'model'
        ? {
            model: row.model,
            cost_usd: row.costUsd,
            tokens_in: row.tokensIn,
            tokens_out: row.tokensOut,
          }
        : null,
    };
  }
}
