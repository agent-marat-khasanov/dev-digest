import type { PrIntentRecord } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { loadDiff } from '../reviews/diff-loader.js';
import { generateIntent } from '@devdigest/reviewer-core';
import { IntentRepository } from './repository.js';

/**
 * Intent service. Orchestrates:
 *   load PR + repo → SHA cache check → linked-issue fetch →
 *   feature-model resolve → generateIntent (LLM) → upsert + return PrIntentRecord.
 *
 * Error policy: genuine LLM/provider errors propagate (→ 5xx). The route
 * never suppresses them — the client panel degrades to EmptyState.
 */

/**
 * Regex to extract the first GitHub issue/PR number from a PR body.
 * Matches either:
 *   - Full URL: https://github.com/<owner>/<repo>/issues/<n>
 *                or .../pull/<n>
 *   - Bare reference: #N
 *
 * The full-URL form is tried first (longer match, more unambiguous).
 */
const ISSUE_REF_REGEX =
  /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/(?:issues|pull)\/(\d+)|(?:^|[\s(,])#(\d+)/gm;

function extractLinkedIssueNumber(body: string | null | undefined): number | null {
  if (!body) return null;
  ISSUE_REF_REGEX.lastIndex = 0;
  const match = ISSUE_REF_REGEX.exec(body);
  if (!match) return null;
  const n = match[1] ?? match[2];
  return n !== undefined ? parseInt(n, 10) : null;
}

export class IntentService {
  private repo: IntentRepository;

  constructor(private container: Container) {
    this.repo = new IntentRepository(container.db);
  }

  async getIntent(workspaceId: string, prId: string): Promise<PrIntentRecord> {
    const { pull, repoRow } = await this.loadPrAndRepo(workspaceId, prId);

    // SHA cache: return the stored intent if it was generated for the current head.
    const stored = await this.repo.getByPr(prId);
    if (stored && stored.headSha === pull.headSha) {
      return {
        pr_id: prId,
        intent: stored.intent,
        in_scope: stored.inScope,
        out_of_scope: stored.outOfScope,
        risks: stored.risks,
      };
    }

    return this.generateAndStore(workspaceId, prId, pull, repoRow);
  }

  /**
   * Force a fresh intent generation, BYPASSING the SHA cache. Backs the explicit
   * `POST /pulls/:id/intent/recalculate` (user-driven). Always makes an LLM call.
   */
  async recalculate(workspaceId: string, prId: string): Promise<PrIntentRecord> {
    const { pull, repoRow } = await this.loadPrAndRepo(workspaceId, prId);
    return this.generateAndStore(workspaceId, prId, pull, repoRow);
  }

  private async loadPrAndRepo(workspaceId: string, prId: string) {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const repoRow = await this.container.reviewRepo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repository not found');

    return { pull, repoRow };
  }

  /** Generate intent via the LLM and upsert it — the shared path for getIntent
   *  (cache miss) and recalculate (cache bypass). */
  private async generateAndStore(
    workspaceId: string,
    prId: string,
    pull: NonNullable<Awaited<ReturnType<Container['reviewRepo']['getPull']>>>,
    repoRow: NonNullable<Awaited<ReturnType<Container['reviewRepo']['getRepo']>>>,
  ): Promise<PrIntentRecord> {
    // 3. Diff + changed file list.
    const diff = await loadDiff(this.container, this.container.reviewRepo, workspaceId, pull, repoRow);
    const changedFiles = diff.files.map((f) => f.path);

    // 4. Linked plan/spec: parse PR body for a GitHub issue/PR reference.
    let spec: { title: string; body: string | null } | null = null;
    const issueNumber = extractLinkedIssueNumber(pull.body);
    if (issueNumber !== null) {
      try {
        const github = await this.container.github();
        const issue = await github.getIssue(
          { owner: repoRow.owner, name: repoRow.name },
          issueNumber,
        );
        spec = { title: issue.title, body: issue.body ?? null };
      } catch {
        // No GitHub token, or the issue is inaccessible — degrade to title+diff inference.
        spec = null;
      }
    }

    // 5. Resolve the feature model for intent generation.
    const { provider, model } = await resolveFeatureModel(
      this.container,
      workspaceId,
      'review_intent',
    );
    const llm = await this.container.llm(provider);

    // 6. Generate intent via the pure reviewer-core function.
    const draft = await generateIntent({
      llm,
      model,
      title: pull.title,
      body: pull.body ?? null,
      spec,
      changedFiles,
      diff: diff.raw,
      maxRetries: 2,
    });

    // 7. Persist (upsert by prId) and return the transport record.
    await this.repo.upsert(prId, {
      intent: draft.intent,
      inScope: draft.in_scope,
      outOfScope: draft.out_of_scope,
      risks: draft.risks,
      headSha: pull.headSha,
    });

    return {
      pr_id: prId,
      intent: draft.intent,
      in_scope: draft.in_scope,
      out_of_scope: draft.out_of_scope,
      risks: draft.risks,
    };
  }
}
