import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Container } from '../../platform/container.js';
import type { AgentRow } from '../../db/rows.js';
import {
  ExpectedFinding,
  type EvalCase,
  type EvalCaseInput,
  type EvalCaseSummary,
  type EvalDashboard,
  type EvalDashboardOverview,
  type EvalOwnerKind,
  type EvalRunRecord,
  type EvalTrendPoint,
  type FindingCategory,
  type Provider,
  type Severity,
  type UnifiedDiff,
} from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { GENERAL_REVIEWER_PROMPT } from '../../db/seed-prompts.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { selectActiveSkillBlocks } from '../reviews/skill-blocks.js';
import { EvalsRepository, type EvalCaseRow, type EvalRunRow } from './repository.js';
import { scoreEval } from './score.js';

/**
 * Eval use cases (application layer). Lists eval cases for an owner (skill or
 * agent) with their latest-run summary, and runs a case for real: it executes
 * the owner against the case's diff through `reviewer-core` (the same engine
 * the live PR review uses), scores the result, and persists an `eval_runs`
 * row.
 *
 * A skill has no provider/model/system-prompt of its own, so a skill-owned
 * eval uses the project defaults (same as the seed): OpenRouter + a cheap
 * model + the general reviewer prompt, with the skill body injected as the
 * only skill (unchanged from the original skill-scoped flow).
 *
 * An agent-owned eval instead uses the agent's OWN system prompt, provider,
 * model, strategy, and enabled linked skills — mirroring
 * `ReviewRunExecutor.runOneAgent`'s config resolution, but WITHOUT any
 * PR/repo-intel enrichment (an eval case is a stored diff, not a live PR).
 */

const EVAL_PROVIDER = 'openrouter' as const;
const EVAL_MODEL = 'deepseek/deepseek-v4-flash';

/** Small fixed output-token budget used only for the pre-run cost estimate (AC-41). */
const ESTIMATE_TOKENS_OUT = 600;

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

  // ==========================================================================
  // Skill-scoped flow (unchanged — pre-existing lesson)
  // ==========================================================================

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

  async runCase(workspaceId: string, skillId: string, caseId: string): Promise<EvalCaseSummary> {
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

  // ==========================================================================
  // Agent-scoped flow (L06 — new)
  // ==========================================================================

  /**
   * Mint an eval case from a finding (AC-1/2/4/5). Owner is resolved via
   * finding → review → agentId; a finding produced by no agent (agentId
   * null) has no case owner to mint into. `input_diff` is the patch of the
   * single file the finding is on. Re-minting the same finding returns the
   * existing case instead of duplicating it (dedup via `inputMeta`, R2).
   */
  async mintFromFinding(workspaceId: string, findingId: string): Promise<EvalCase> {
    const ctx = await this.container.reviewRepo.findingContext(findingId);
    if (!ctx || ctx.pull.workspaceId !== workspaceId) {
      throw new NotFoundError('Finding not found');
    }
    const agentId = ctx.review.agentId;
    if (!agentId) throw new NotFoundError('Finding not found');

    const existing = await this.repo.findCaseBySourceFinding(
      workspaceId,
      'agent',
      agentId,
      findingId,
    );
    if (existing) return toEvalCase(existing);

    const { finding } = ctx;
    const decision: 'accepted' | 'dismissed' | null = finding.acceptedAt
      ? 'accepted'
      : finding.dismissedAt
        ? 'dismissed'
        : null;
    if (!decision) {
      throw new ValidationError('Finding must be accepted or dismissed before minting an eval case');
    }

    const files = await this.container.reviewRepo.getPrFiles(ctx.pull.id);
    const file = files.find((f) => f.path === finding.file);
    const inputDiff = file?.patch ?? '';

    const expectedOutput: ExpectedFinding[] =
      decision === 'accepted'
        ? [
            {
              severity: finding.severity as Severity,
              category: finding.category as FindingCategory,
              title: finding.title,
              file: finding.file,
              start_line: finding.startLine,
              end_line: finding.endLine,
            },
          ]
        : [];

    const row = await this.repo.insertCase({
      workspaceId,
      ownerKind: 'agent',
      ownerId: agentId,
      name: `Finding: ${finding.title}`.slice(0, 200),
      inputDiff,
      inputMeta: { source_finding_id: findingId },
      expectedOutput,
    });
    return toEvalCase(row);
  }

  /** Every case owned by the agent, with its latest-run summary (AC-6). */
  async listAgentSummaries(workspaceId: string, agentId: string): Promise<EvalCaseSummary[]> {
    await this.requireAgent(workspaceId, agentId);
    const cases = await this.repo.listCasesForOwner(workspaceId, 'agent', agentId);
    const latest = await this.repo.latestRunByCase(cases.map((c) => c.id));
    return cases.map((c) => toSummary(c, latest.get(c.id)));
  }

  /** Cost estimate for running every case in the agent's set (AC-41). */
  async estimateAgentRun(
    workspaceId: string,
    agentId: string,
  ): Promise<{ case_count: number; estimated_cost_usd: number | null }> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const cases = await this.repo.listCasesForOwner(workspaceId, 'agent', agentId);
    return {
      case_count: cases.length,
      estimated_cost_usd: await this.estimateCasesCost(agent, cases),
    };
  }

  /**
   * Run every case in the agent's set with the agent's OWN config (AC-7/8/9),
   * grouped under one `batchId` so Compare/dashboard/trend have a well-defined
   * "run" unit (R1). A zero-case set is a no-op, not an error (AC-12). One
   * case's LLM failure is recorded as a failed run (metrics null) and the
   * remaining cases still run (AC-13). Requires prior confirmation (AC-41).
   */
  async runAllForAgent(
    workspaceId: string,
    agentId: string,
    confirm: boolean,
  ): Promise<EvalCaseSummary[]> {
    const agent = await this.requireAgent(workspaceId, agentId);
    if (!confirm) throw new ValidationError('Run-all requires confirmation');
    const cases = await this.repo.listCasesForOwner(workspaceId, 'agent', agentId);
    if (cases.length === 0) return [];

    const batchId = randomUUID();
    const summaries: EvalCaseSummary[] = [];
    for (const c of cases) {
      const run = await this.runAgentCase(agent, c, batchId);
      summaries.push(toSummary(c, run));
    }
    return summaries;
  }

  /** Run one case directly — no estimate/confirmation step (AC-10/42). */
  async runOneAgentCase(
    workspaceId: string,
    agentId: string,
    caseId: string,
  ): Promise<EvalCaseSummary> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const c = await this.requireAgentCase(workspaceId, agentId, caseId);
    const run = await this.runAgentCase(agent, c, null);
    return toSummary(c, run);
  }

  /** Create a manually-authored case in the agent's set (AC-31/32/33, Stretch 2). */
  async createAgentCase(
    workspaceId: string,
    agentId: string,
    input: EvalCaseInput,
  ): Promise<EvalCase> {
    await this.requireAgent(workspaceId, agentId);
    const expectedOutput = parseExpectedOutput(input.expected_output);
    const row = await this.repo.insertCase({
      workspaceId,
      ownerKind: 'agent',
      ownerId: agentId,
      name: input.name,
      inputDiff: input.input_diff,
      inputMeta: input.input_meta ?? undefined,
      expectedOutput,
      notes: input.notes ?? null,
    });
    return toEvalCase(row);
  }

  /** Edit a manually-authored (or minted) case (AC-31/33, Stretch 2). */
  async updateAgentCase(
    workspaceId: string,
    agentId: string,
    caseId: string,
    patch: Partial<EvalCaseInput>,
  ): Promise<EvalCase> {
    await this.requireAgentCase(workspaceId, agentId, caseId);
    const row = await this.repo.updateCase(workspaceId, caseId, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.input_diff !== undefined ? { inputDiff: patch.input_diff } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes ?? null } : {}),
      ...(patch.expected_output !== undefined
        ? { expectedOutput: parseExpectedOutput(patch.expected_output) }
        : {}),
    });
    return toEvalCase(row!);
  }

  async deleteAgentCase(workspaceId: string, agentId: string, caseId: string): Promise<boolean> {
    await this.requireAgentCase(workspaceId, agentId, caseId);
    return this.repo.deleteCase(workspaceId, caseId);
  }

  /** Per-agent dashboard aggregate (AC-26). */
  async agentDashboard(workspaceId: string, agentId: string): Promise<EvalDashboard> {
    await this.requireAgent(workspaceId, agentId);
    const cases = await this.repo.listCasesForOwner(workspaceId, 'agent', agentId);
    const runs = await this.repo.listRunsForCases(cases.map((c) => c.id));
    return buildDashboard('agent', agentId, cases.length, cases, runs);
  }

  /** Every run of the agent's cases, newest first (AC-27 Compare data source). */
  async runsForAgent(workspaceId: string, agentId: string): Promise<EvalRunRecord[]> {
    await this.requireAgent(workspaceId, agentId);
    const cases = await this.repo.listCasesForOwner(workspaceId, 'agent', agentId);
    const runs = await this.repo.listRunsForCases(cases.map((c) => c.id));
    const nameById = new Map(cases.map((c) => [c.id, c.name]));
    return [...runs]
      .sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime())
      .map((r) => toRunRecord(r, nameById.get(r.caseId)));
  }

  /** Cost estimate for running every agent's case set once, sequentially (AC-41/43). */
  async estimateWorkspaceRun(
    workspaceId: string,
  ): Promise<{ agent_count: number; case_count: number; estimated_cost_usd: number | null }> {
    const agents = await this.container.agentsRepo.list(workspaceId);
    let caseCount = 0;
    let total = 0;
    let unknownCost = false;
    for (const agent of agents) {
      const cases = await this.repo.listCasesForOwner(workspaceId, 'agent', agent.id);
      caseCount += cases.length;
      const est = await this.estimateCasesCost(agent, cases);
      if (est === null) unknownCost = true;
      else total += est;
    }
    return {
      agent_count: agents.length,
      case_count: caseCount,
      estimated_cost_usd: unknownCost ? null : total,
    };
  }

  /**
   * Workspace "Run all agents" (AC-43): every agent's case set, one agent
   * after another (never in parallel, to avoid hammering the provider), each
   * grouped under its own batch. Requires prior confirmation (AC-41/43).
   */
  async runAllAgentsInWorkspace(
    workspaceId: string,
    confirm: boolean,
  ): Promise<EvalDashboardOverview> {
    if (!confirm) throw new ValidationError('Run-all requires confirmation');
    const agents = await this.container.agentsRepo.list(workspaceId);
    for (const agent of agents) {
      const cases = await this.repo.listCasesForOwner(workspaceId, 'agent', agent.id);
      if (cases.length === 0) continue;
      const batchId = randomUUID();
      for (const c of cases) {
        await this.runAgentCase(agent, c, batchId);
      }
    }
    return this.dashboardOverview(workspaceId);
  }

  /** All-agents sidebar dashboard (AC-24). */
  async dashboardOverview(workspaceId: string): Promise<EvalDashboardOverview> {
    const agents = await this.container.agentsRepo.list(workspaceId);
    const rows: EvalDashboardOverview['agents'] = [];
    const allRuns: { run: EvalRunRow; caseName: string | undefined }[] = [];

    for (const agent of agents) {
      const cases = await this.repo.listCasesForOwner(workspaceId, 'agent', agent.id);
      if (cases.length === 0) {
        rows.push({
          agent_id: agent.id,
          agent_name: agent.name,
          recall: null,
          precision: null,
          citation_accuracy: null,
          last_run_pass_count: null,
        });
        continue;
      }
      const runs = await this.repo.listRunsForCases(cases.map((c) => c.id));
      const nameById = new Map(cases.map((c) => [c.id, c.name]));
      for (const r of runs) allRuns.push({ run: r, caseName: nameById.get(r.caseId) });

      const latest = latestBatch(runs);
      const agg = latest ? aggregateBatch(latest) : null;
      rows.push({
        agent_id: agent.id,
        agent_name: agent.name,
        recall: agg?.recall ?? null,
        precision: agg?.precision ?? null,
        citation_accuracy: agg?.citationAccuracy ?? null,
        last_run_pass_count: agg ? { passed: agg.passed, total: agg.total } : null,
      });
    }

    const recentRuns = allRuns
      .sort((a, b) => b.run.ranAt.getTime() - a.run.ranAt.getTime())
      .slice(0, 20)
      .map(({ run, caseName }) => toRunRecord(run, caseName));

    return { agents: rows, recent_runs: recentRuns };
  }

  // ---- private helpers ------------------------------------------------------

  private async requireAgent(workspaceId: string, agentId: string): Promise<AgentRow> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  private async requireAgentCase(
    workspaceId: string,
    agentId: string,
    caseId: string,
  ): Promise<EvalCaseRow> {
    const c = await this.repo.getCase(workspaceId, caseId);
    if (!c || c.ownerKind !== 'agent' || c.ownerId !== agentId) {
      throw new NotFoundError('Eval case not found');
    }
    return c;
  }

  /**
   * The real-LLM run for an agent case: uses the agent's OWN system prompt,
   * provider, model, strategy, and enabled linked skills — no PR/repo-intel
   * enrichment (callers/repoMap/intent/specs), so the case diff is the only
   * variable (AC-8/9). One case's failure is recorded as a failed run rather
   * than propagated (AC-13) — the caller (run-all) continues to the next case.
   */
  private async runAgentCase(
    agent: AgentRow,
    c: EvalCaseRow,
    batchId: string | null,
  ): Promise<EvalRunRow> {
    const start = Date.now();
    try {
      const diff = parseUnifiedDiff(c.inputDiff ?? '');
      const llm = await this.container.llm(agent.provider as Provider);
      const skillBodies = await this.enabledSkillBodies(agent);

      const outcome = await reviewPullRequest({
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        diff,
        llm,
        strategy: agent.strategy,
        ...(skillBodies.length > 0 ? { skills: skillBodies } : {}),
        task: `Eval: run agent "${agent.name}" against case "${c.name}"`,
        sessionId: `eval/agent/${agent.name}/${c.name}`,
      });
      const durationMs = Date.now() - start;

      const expected = expectedOf(c);
      const actual = outcome.review.findings;
      const score = scoreEval(expected, actual, changedLineSet(diff));

      return this.repo.insertRun({
        caseId: c.id,
        actualOutput: actual,
        pass: score.pass,
        recall: score.recall,
        precision: score.precision,
        citationAccuracy: score.citationAccuracy,
        durationMs,
        costUsd: outcome.costUsd,
        agentVersion: agent.version,
        batchId,
      });
    } catch {
      // AC-13: one case's LLM failure is recorded as failed, not thrown —
      // the caller continues with the remaining cases.
      const durationMs = Date.now() - start;
      return this.repo.insertRun({
        caseId: c.id,
        actualOutput: null,
        pass: false,
        recall: null,
        precision: null,
        citationAccuracy: null,
        durationMs,
        costUsd: null,
        agentVersion: agent.version,
        batchId,
      });
    }
  }

  private async enabledSkillBodies(agent: AgentRow): Promise<string[]> {
    const linked = await this.container.agentsRepo.linkedSkills(agent.id);
    return selectActiveSkillBlocks(linked, (text) => this.container.tokenizer.count(text)).map(
      (b) => b.body,
    );
  }

  /**
   * Σ tokenizer.count(system prompt + skills + case diff) × price-book
   * estimate, per case (R3) — an ESTIMATE for the confirm gate, not a quote.
   * Returns null when the model has no known price (off-catalog) so the
   * caller can surface "unknown cost" rather than a misleading number.
   */
  private async estimateCasesCost(agent: AgentRow, cases: EvalCaseRow[]): Promise<number | null> {
    if (cases.length === 0) return 0;
    const skillBodies = await this.enabledSkillBodies(agent);
    const skillsText = skillBodies.join('\n');
    let total = 0;
    for (const c of cases) {
      const tokensIn = this.container.tokenizer.count(
        agent.systemPrompt + skillsText + (c.inputDiff ?? ''),
      );
      const cost = this.container.priceBook.estimate(agent.model, tokensIn, ESTIMATE_TOKENS_OUT);
      if (cost === null) return null;
      total += cost;
    }
    return total;
  }
}

// ---- pure boundary mappers ------------------------------------------------

function parseExpectedOutput(value: unknown): ExpectedFinding[] {
  const parsed = z.array(ExpectedFinding).safeParse(value);
  if (!parsed.success) {
    throw new ValidationError('Invalid expected_output', parsed.error.flatten());
  }
  return parsed.data;
}

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

function toEvalCase(row: EvalCaseRow): EvalCase {
  return {
    id: row.id,
    owner_kind: row.ownerKind as EvalOwnerKind,
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff ?? '',
    input_files: row.inputFiles,
    input_meta: row.inputMeta,
    expected_output: row.expectedOutput,
    notes: row.notes,
  };
}

function toRunRecord(r: EvalRunRow, caseName: string | undefined): EvalRunRecord {
  return {
    id: r.id,
    case_id: r.caseId,
    case_name: caseName ?? null,
    ran_at: r.ranAt.toISOString(),
    actual_output: r.actualOutput,
    pass: r.pass,
    recall: r.recall,
    precision: r.precision,
    citation_accuracy: r.citationAccuracy,
    duration_ms: r.durationMs,
    cost_usd: r.costUsd,
    agent_version: r.agentVersion,
    batch_id: r.batchId,
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

// ---- dashboard aggregation (pure) ------------------------------------------
//
// "One run" for dashboard/trend/compare purposes is a BATCH (R1): all the
// per-case `eval_runs` rows produced by one run-all share a `batchId`. A
// single-case run (no batch) is its own one-row batch, keyed by its own id.

function groupByBatch(runs: EvalRunRow[]): Map<string, EvalRunRow[]> {
  const groups = new Map<string, EvalRunRow[]>();
  for (const r of runs) {
    const key = r.batchId ?? r.id;
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }
  return groups;
}

function batchTimestamp(runs: EvalRunRow[]): number {
  return Math.max(...runs.map((r) => r.ranAt.getTime()));
}

function chronologicalBatches(runs: EvalRunRow[]): EvalRunRow[][] {
  return [...groupByBatch(runs).values()].sort((a, b) => batchTimestamp(a) - batchTimestamp(b));
}

function latestBatch(runs: EvalRunRow[]): EvalRunRow[] | null {
  const batches = chronologicalBatches(runs);
  return batches.at(-1) ?? null;
}

interface BatchAggregate {
  recall: number;
  precision: number;
  citationAccuracy: number;
  passed: number;
  total: number;
  costUsd: number | null;
}

function aggregateBatch(runs: EvalRunRow[]): BatchAggregate {
  const scored = runs.filter(
    (r) => r.recall !== null && r.precision !== null && r.citationAccuracy !== null,
  );
  const avg = (sel: (r: EvalRunRow) => number | null): number =>
    scored.length > 0 ? scored.reduce((sum, r) => sum + (sel(r) ?? 0), 0) / scored.length : 0;
  const costs = runs.filter((r): r is EvalRunRow & { costUsd: number } => r.costUsd !== null);
  return {
    recall: avg((r) => r.recall),
    precision: avg((r) => r.precision),
    citationAccuracy: avg((r) => r.citationAccuracy),
    passed: runs.filter((r) => r.pass === true).length,
    total: runs.length,
    costUsd: costs.length > 0 ? costs.reduce((sum, r) => sum + r.costUsd, 0) : null,
  };
}

function buildDashboard(
  ownerKind: EvalOwnerKind | null,
  ownerId: string | null,
  casesTotal: number,
  cases: EvalCaseRow[],
  runs: EvalRunRow[],
): EvalDashboard {
  const nameById = new Map(cases.map((c) => [c.id, c.name]));
  const batches = chronologicalBatches(runs);
  const trend: EvalTrendPoint[] = batches.map((batch) => {
    const agg = aggregateBatch(batch);
    return {
      ran_at: new Date(batchTimestamp(batch)).toISOString(),
      recall: agg.recall,
      precision: agg.precision,
      citation_accuracy: agg.citationAccuracy,
      pass_rate: agg.total > 0 ? agg.passed / agg.total : 0,
      cost_usd: agg.costUsd,
    };
  });

  const latest = batches.at(-1);
  const previous = batches.at(-2);
  const latestAgg = latest ? aggregateBatch(latest) : null;
  const prevAgg = previous ? aggregateBatch(previous) : null;

  const recentRuns = [...runs]
    .sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime())
    .slice(0, 20)
    .map((r) => toRunRecord(r, nameById.get(r.caseId)));

  return {
    owner_kind: ownerKind,
    owner_id: ownerId,
    cases_total: casesTotal,
    current: {
      recall: latestAgg?.recall ?? 0,
      precision: latestAgg?.precision ?? 0,
      citation_accuracy: latestAgg?.citationAccuracy ?? 0,
      traces_passed: latestAgg?.passed ?? 0,
      traces_total: latestAgg?.total ?? 0,
      cost_usd: latestAgg?.costUsd ?? null,
    },
    delta: {
      recall: (latestAgg?.recall ?? 0) - (prevAgg?.recall ?? latestAgg?.recall ?? 0),
      precision: (latestAgg?.precision ?? 0) - (prevAgg?.precision ?? latestAgg?.precision ?? 0),
      citation_accuracy:
        (latestAgg?.citationAccuracy ?? 0) -
        (prevAgg?.citationAccuracy ?? latestAgg?.citationAccuracy ?? 0),
    },
    trend,
    recent_runs: recentRuns,
    alert:
      prevAgg && latestAgg && latestAgg.recall < prevAgg.recall
        ? 'Recall regressed since the previous run'
        : null,
  };
}
