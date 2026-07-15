import type { Brief } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { loadPromptTemplate } from '../../platform/prompts.js';
import {
  gatherArtifacts,
  enforceBudget,
  buildChangedFileSet,
  buildRiskRefSet,
  validateBrief,
  type BriefArtifacts,
} from './assemble.js';
import { BriefModelOutput, buildUserMessage } from './prompt.js';
import { BriefRepository, type PrBriefRow } from './repository.js';

/** Minimal structured logger (pino-compatible: (obj, msg)) for cost logging. */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
};

/**
 * Brief service. Orchestrates:
 *   load PR → head_sha cache check → gatherArtifacts → enforceBudget →
 *   feature-model resolve → ONE completeStructured → validateBrief →
 *   upsert + return Brief.
 *
 * Mirrors the `intent` module's getIntent/recalculate/generateAndStore split
 * (`modules/intent/service.ts`). Deliberate divergence from onboarding: a
 * model failure propagates (→ 5xx) — NO skeleton/degraded fallback, NO
 * partial persist (AC-16, the intent error policy).
 */
export class BriefService {
  private repo: BriefRepository;

  constructor(private container: Container) {
    this.repo = new BriefRepository(container.db);
  }

  async getBrief(workspaceId: string, prId: string, logger?: Logger): Promise<Brief> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const stored = await this.repo.getByPr(prId);
    if (stored && stored.headSha !== null && stored.headSha === pull.headSha) {
      return this.toBrief(prId, stored);
    }

    return this.generateAndStore(workspaceId, prId, logger);
  }

  /**
   * Force a fresh brief generation, BYPASSING the head_sha cache. Backs the
   * explicit `POST /pulls/:id/brief/regenerate` (user-driven). Always makes
   * an LLM call.
   */
  async regenerate(workspaceId: string, prId: string, logger?: Logger): Promise<Brief> {
    return this.generateAndStore(workspaceId, prId, logger);
  }

  /** Generate the brief via the LLM and upsert it — the shared path for
   *  getBrief (cache miss) and regenerate (cache bypass). ONE
   *  completeStructured call (AC-4); on failure, propagates — no partial
   *  persist (AC-16). */
  private async generateAndStore(workspaceId: string, prId: string, logger?: Logger): Promise<Brief> {
    const artifacts: BriefArtifacts = await gatherArtifacts(this.container, workspaceId, prId);

    const blocks = enforceBudget(artifacts.blocks, this.container.tokenizer);
    const userMessage = buildUserMessage(blocks);

    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'risk_brief');
    const llm = await this.container.llm(provider);

    const systemPrompt = await loadPromptTemplate('brief.system.md');

    const result = await llm.completeStructured({
      model,
      schema: BriefModelOutput,
      schemaName: 'BriefModelOutput',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    const changedFileSet = buildChangedFileSet(artifacts.smartDiff, artifacts.prFilePaths);
    const riskRefSet = buildRiskRefSet(changedFileSet, artifacts.blast);
    const validated = validateBrief(result.data, changedFileSet, riskRefSet);

    logger?.info(
      {
        cost_usd: result.costUsd,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        model: result.model,
      },
      'brief: generated',
    );

    const generatedAt = new Date().toISOString();
    const generated = {
      model: result.model,
      cost_usd: result.costUsd,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
    };

    const payload = {
      what: validated.what,
      why: validated.why,
      risk_level: validated.risk_level,
      risks: validated.risks,
      review_focus: validated.review_focus,
      generated_at: generatedAt,
      generated,
    };

    await this.repo.upsert(prId, {
      json: payload,
      headSha: artifacts.pull.headSha,
    });

    return { pr_id: prId, ...payload };
  }

  private toBrief(prId: string, row: PrBriefRow): Brief {
    const json = row.json as Omit<Brief, 'pr_id'>;
    return { pr_id: prId, ...json };
  }
}
