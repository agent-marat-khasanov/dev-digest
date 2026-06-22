import type { Container } from '../../platform/container.js';
import type {
  EvalCaseSummary,
  ExpectedFinding,
  FindingCategory,
  Severity,
  UnifiedDiff,
} from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { GENERAL_REVIEWER_PROMPT } from '../../db/seed-prompts.js';
import { NotFoundError } from '../../platform/errors.js';
import { EvalsRepository, type EvalCaseRow, type EvalRunRow } from './repository.js';
import { scoreEval } from './score.js';

/**
 * Eval use cases (application layer). Lists eval cases for a skill with their
 * latest-run summary, and runs a case for real: it executes the skill against
 * the case's diff through `reviewer-core` (the same engine the live PR review
 * uses), scores the result, and persists an `eval_runs` row.
 *
 * A skill has no provider/model/system-prompt of its own, so a skill-owned eval
 * uses the project defaults (same as the seed): OpenRouter + a cheap model + the
 * general reviewer prompt, with the skill body injected as the only skill.
 */

const EVAL_PROVIDER = 'openrouter' as const;
const EVAL_MODEL = 'deepseek/deepseek-v4-flash';

const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 3,
  WARNING: 2,
  SUGGESTION: 1,
};

export class EvalsService {
  private repo: EvalsRepository;

  constructor(private container: Container) {
    this.repo = new EvalsRepository(container.db);
  }

  async listSummaries(workspaceId: string, skillId: string): Promise<EvalCaseSummary[]> {
    await this.requireSkill(workspaceId, skillId);
    const cases = await this.repo.listCasesForOwner(workspaceId, 'skill', skillId);
    const latest = await this.repo.latestRunByCase(cases.map((c) => c.id));
    return cases.map((c) => toSummary(c, latest.get(c.id)));
  }

  /** Run every case for the skill, sequentially (avoid hammering the provider). */
  async runAll(workspaceId: string, skillId: string): Promise<EvalCaseSummary[]> {
    await this.requireSkill(workspaceId, skillId);
    const cases = await this.repo.listCasesForOwner(workspaceId, 'skill', skillId);
    const summaries: EvalCaseSummary[] = [];
    for (const c of cases) {
      summaries.push(await this.runOne(workspaceId, skillId, c));
    }
    return summaries;
  }

  async runCase(
    workspaceId: string,
    skillId: string,
    caseId: string,
  ): Promise<EvalCaseSummary> {
    await this.requireSkill(workspaceId, skillId);
    const c = await this.repo.getCase(workspaceId, caseId);
    if (!c || c.ownerKind !== 'skill' || c.ownerId !== skillId) {
      throw new NotFoundError('Eval case not found');
    }
    return this.runOne(workspaceId, skillId, c);
  }

  async deleteCase(workspaceId: string, skillId: string, caseId: string): Promise<boolean> {
    await this.requireSkill(workspaceId, skillId);
    const c = await this.repo.getCase(workspaceId, caseId);
    if (!c || c.ownerKind !== 'skill' || c.ownerId !== skillId) return false;
    return this.repo.deleteCase(workspaceId, caseId);
  }

  /** The real-LLM run: assemble → review → score → persist. */
  private async runOne(
    workspaceId: string,
    skillId: string,
    c: EvalCaseRow,
  ): Promise<EvalCaseSummary> {
    const skill = await this.requireSkill(workspaceId, skillId);
    const diff = parseUnifiedDiff(c.inputDiff ?? '');
    const llm = await this.container.llm(EVAL_PROVIDER);

    const start = Date.now();
    const outcome = await reviewPullRequest({
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      model: EVAL_MODEL,
      diff,
      llm,
      skills: [skill.body],
      task: `Eval: run skill "${skill.name}" against case "${c.name}"`,
      sessionId: `eval/${skill.name}/${c.name}`,
    });
    const durationMs = Date.now() - start;

    const expected = expectedOf(c);
    const actual = outcome.review.findings;
    const score = scoreEval(expected, actual, changedLineSet(diff));

    const run = await this.repo.insertRun({
      caseId: c.id,
      actualOutput: actual,
      pass: score.pass,
      recall: score.recall,
      precision: score.precision,
      citationAccuracy: score.citationAccuracy,
      durationMs,
      costUsd: outcome.costUsd,
    });
    return toSummary(c, run);
  }

  private async requireSkill(workspaceId: string, skillId: string) {
    const skill = await this.container.skillsRepo.getById(workspaceId, skillId);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  }
}

// ---- pure boundary mappers ------------------------------------------------

function expectedOf(c: EvalCaseRow): ExpectedFinding[] {
  return Array.isArray(c.expectedOutput) ? (c.expectedOutput as ExpectedFinding[]) : [];
}

function primaryExpected(
  expected: ExpectedFinding[],
): { severity: Severity; category: FindingCategory } | null {
  if (expected.length === 0) return null;
  const top = expected.reduce((a, b) =>
    SEVERITY_RANK[b.severity] > SEVERITY_RANK[a.severity] ? b : a,
  );
  return { severity: top.severity, category: top.category };
}

function toSummary(c: EvalCaseRow, run: EvalRunRow | undefined): EvalCaseSummary {
  const expected = expectedOf(c);
  return {
    id: c.id,
    name: c.name,
    expected_count: expected.length,
    primary: primaryExpected(expected),
    last_run: run
      ? {
          pass: run.pass,
          actual_count: Array.isArray(run.actualOutput) ? run.actualOutput.length : 0,
          ran_at: run.ranAt.toISOString(),
        }
      : null,
  };
}

/** Set of `${file}:${line}` keys on the new side of the diff (for citation accuracy). */
function changedLineSet(diff: UnifiedDiff): Set<string> {
  const set = new Set<string>();
  for (const f of diff.files) {
    for (const h of f.hunks) {
      for (const ln of h.newLineNumbers) set.add(`${f.path}:${ln}`);
    }
  }
  return set;
}
