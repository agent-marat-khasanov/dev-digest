// REAL excerpt from server/src/modules/evals/service.ts (current HEAD) — kept verbatim except
// unrelated imports/methods trimmed for length. `EvalsService.runOne` imports and calls
// `parseUnifiedDiff` (server/src/adapters/git/diff-parser.ts) DIRECTLY from the application
// layer, bypassing any repository indirection. This LOOKS like a layering violation (a service
// reaching straight for an adapter module) but is a recorded, deliberate exception:
//
//   server/INSIGHTS.md:53 — "`parseUnifiedDiff` (`adapters/git/diff-parser.ts`) is pure (no I/O)
//   so a service may import it directly without violating the dependency rule. A raw unified-diff
//   string (e.g. `eval_cases.input_diff`) becomes a `UnifiedDiff` via this one call — same parser
//   the live review path uses."
//
// `parseUnifiedDiff` does zero I/O — no fs/DB/network — so importing it is no different from
// importing a pure utility function; the dependency-rule concern is about I/O-performing adapters,
// not about *file location* alone.

import type { Container } from '../../platform/container.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { GENERAL_REVIEWER_PROMPT } from '../../db/seed-prompts.js';
import { EvalsRepository, type EvalCaseRow } from './repository.js';
import { scoreEval } from './score.js';
import { reviewPullRequest } from '@devdigest/reviewer-core';

const EVAL_PROVIDER = 'openrouter' as const;
const EVAL_MODEL = 'deepseek/deepseek-v4-flash';

export class EvalsService {
  private repo: EvalsRepository;

  constructor(private container: Container) {
    this.repo = new EvalsRepository(container.db);
  }

  private async runOne(workspaceId: string, skillId: string, c: EvalCaseRow) {
    const skill = await this.requireSkill(workspaceId, skillId);
    const diff = parseUnifiedDiff(c.inputDiff ?? '');
    const llm = await this.container.llm(EVAL_PROVIDER);

    const outcome = await reviewPullRequest({
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      model: EVAL_MODEL,
      diff,
      llm,
      skills: [skill.body],
      task: `Eval: run skill "${skill.name}" against case "${c.name}"`,
      sessionId: `eval/${skill.name}/${c.name}`,
    });

    const expected = c.expectedOutput ?? [];
    const actual = outcome.review.findings;
    const score = scoreEval(expected, actual, new Set());

    return this.repo.insertRun({
      caseId: c.id,
      actualOutput: actual,
      pass: score.pass,
      recall: score.recall,
      precision: score.precision,
      citationAccuracy: score.citationAccuracy,
      durationMs: 0,
      costUsd: outcome.costUsd,
    });
  }

  private async requireSkill(workspaceId: string, skillId: string) {
    throw new Error('trimmed for fixture brevity');
  }
}
