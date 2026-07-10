import type { Provider, Review } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { REVIEW_STRATEGY } from '../reviews/constants.js';

/**
 * Working-tree review service. Backs the `devdigest review --mode working` CLI:
 * reviews a RAW unified diff (uncommitted changes) with the SAME product agent +
 * engine that reviews PRs — the pure `reviewPullRequest` from reviewer-core, with
 * the agent's systemPrompt/model/provider resolved from the DB.
 *
 * A different entry point, identical reviewer. No PR, no persistence, no
 * repo-intel enrichment — just diff → findings.
 */
export class ReviewWorkingService {
  constructor(private container: Container) {}

  async review(workspaceId: string, rawDiff: string, agentName?: string): Promise<Review> {
    const diff = parseUnifiedDiff(rawDiff);
    if (diff.files.length === 0) {
      throw new AppError('empty_diff', 'The provided diff contains no file changes', 400);
    }

    const agents = await this.container.agentsRepo.listEnabled(workspaceId);
    if (agents.length === 0) throw new NotFoundError('No enabled review agent is configured');
    const agent = agentName ? agents.find((a) => a.name === agentName) : agents[0];
    if (!agent) throw new NotFoundError(`Review agent "${agentName}" not found or not enabled`);

    const llm = await this.container.llm(agent.provider as Provider);

    const outcome = await reviewPullRequest({
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      diff,
      llm,
      strategy: agent.strategy ?? REVIEW_STRATEGY,
    });
    return outcome.review;
  }
}
