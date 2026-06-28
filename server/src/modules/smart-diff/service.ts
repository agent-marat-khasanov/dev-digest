import type { SmartDiff, SmartDiffFile, SmartDiffGroup, SmartDiffRole } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { classifyFile } from './classify.js';
import { ROLE_ORDER, ROLE_LABEL, SPLIT_TOO_BIG_LINES } from './constants.js';

/**
 * SmartDiff application service.
 *
 * Composes PR files + the latest review's findings into the SmartDiff contract.
 * No LLM call — reads only via container.reviewRepo (DB-only, free).
 *
 * HARD CONSTRAINT: this file MUST NOT import container.llm,
 * @devdigest/reviewer-core, resolveFeatureModel, or loadDiff.
 */
export class SmartDiffService {
  constructor(private container: Container) {}

  async getSmartDiff(workspaceId: string, prId: string): Promise<SmartDiff> {
    // 1. Verify the PR exists (workspace-scoped 404 guard)
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    // 2. Fetch all files for this PR
    const prFiles = await this.container.reviewRepo.getPrFiles(prId);

    // 3. Fetch reviews (newest first); use index [0] as the latest
    const reviews = await this.container.reviewRepo.reviewsForPull(prId);
    const latestReview = reviews[0];

    // 4. Build finding_lines map: file path → list of start lines (one entry per finding)
    const findingLinesByFile = new Map<string, number[]>();
    if (latestReview) {
      for (const finding of latestReview.findings) {
        const lines = findingLinesByFile.get(finding.file) ?? [];
        lines.push(finding.startLine);
        findingLinesByFile.set(finding.file, lines);
      }
    }

    // 5. Classify each file and bucket into role groups
    const byRole = new Map<SmartDiffRole, SmartDiffFile[]>();
    for (const file of prFiles) {
      const role = classifyFile(file.path);
      const smartFile: SmartDiffFile = {
        path: file.path,
        additions: file.additions,
        deletions: file.deletions,
        finding_lines: findingLinesByFile.get(file.path) ?? [],
        pseudocode_summary: null,
      };
      const bucket = byRole.get(role) ?? [];
      bucket.push(smartFile);
      byRole.set(role, bucket);
    }

    // 6. Build groups in ROLE_ORDER, omitting empty groups
    const groups: SmartDiffGroup[] = [];
    for (const role of ROLE_ORDER) {
      const files = byRole.get(role);
      if (files && files.length > 0) {
        groups.push({ role, files });
      }
    }

    // 7. Compute split_suggestion
    const total_lines = prFiles.reduce((sum, f) => sum + f.additions + f.deletions, 0);
    const too_big = total_lines > SPLIT_TOO_BIG_LINES;

    const proposed_splits = ROLE_ORDER
      .filter((role) => (byRole.get(role)?.length ?? 0) > 0)
      .map((role) => ({
        name: ROLE_LABEL[role],
        files: (byRole.get(role) ?? []).map((f) => f.path),
      }));

    return {
      groups,
      split_suggestion: {
        too_big,
        total_lines,
        proposed_splits,
      },
    };
  }
}
