import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { EvalOwnerKind } from '@devdigest/shared';

/**
 * Eval data-access. Owns `eval_cases` and `eval_runs`. Workspace-scoped.
 * Skill-owned cases come from the DB seed; agent-owned cases are also minted
 * from findings and created/edited via the L06 routes. Persists run results.
 */

export type EvalCaseRow = typeof t.evalCases.$inferSelect;
export type EvalRunRow = typeof t.evalRuns.$inferSelect;

export interface InsertEvalRun {
  caseId: string;
  actualOutput: unknown;
  pass: boolean;
  /** Null when the run failed before scoring (AC-13). */
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number;
  costUsd: number | null;
  /** Agent config version the run executed under (AC-44); null for skill-owned runs. */
  agentVersion?: number | null;
  /** Groups the per-case rows produced by one run-all into a logical "run" (R1). */
  batchId?: string | null;
}

export interface InsertEvalCase {
  workspaceId: string;
  ownerKind: EvalOwnerKind;
  ownerId: string;
  name: string;
  inputDiff: string;
  inputMeta?: unknown;
  expectedOutput: unknown;
  notes?: string | null;
}

export interface UpdateEvalCase {
  name?: string;
  inputDiff?: string;
  notes?: string | null;
  expectedOutput?: unknown;
}

export class EvalsRepository {
  constructor(private db: Db) {}

  /** Eval cases for one owner (e.g. a skill), alphabetical by name. */
  async listCasesForOwner(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<EvalCaseRow[]> {
    return this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, ownerKind),
          eq(t.evalCases.ownerId, ownerId),
        ),
      )
      .orderBy(asc(t.evalCases.name));
  }

  async getCase(workspaceId: string, caseId: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)));
    return row;
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  async insertCase(values: InsertEvalCase): Promise<EvalCaseRow> {
    const [row] = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: values.workspaceId,
        ownerKind: values.ownerKind,
        ownerId: values.ownerId,
        name: values.name,
        inputDiff: values.inputDiff,
        inputMeta: (values.inputMeta ?? null) as object | null,
        expectedOutput: values.expectedOutput as object,
        notes: values.notes ?? null,
      })
      .returning();
    return row!;
  }

  async updateCase(
    workspaceId: string,
    caseId: string,
    patch: UpdateEvalCase,
  ): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .update(t.evalCases)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.inputDiff !== undefined ? { inputDiff: patch.inputDiff } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(patch.expectedOutput !== undefined
          ? { expectedOutput: patch.expectedOutput as object }
          : {}),
      })
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
      .returning();
    return row;
  }

  /**
   * Find an agent-owned case that was minted from the given finding, by
   * matching `inputMeta.source_finding_id` in JS (dedup pointer — R2, no DB
   * column). The case set per owner is small, so filtering client-side after
   * one query is fine.
   */
  async findCaseBySourceFinding(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
    findingId: string,
  ): Promise<EvalCaseRow | undefined> {
    const cases = await this.listCasesForOwner(workspaceId, ownerKind, ownerId);
    return cases.find((c) => {
      const meta = c.inputMeta as { source_finding_id?: string } | null;
      return meta?.source_finding_id === findingId;
    });
  }

  async insertRun(values: InsertEvalRun): Promise<EvalRunRow> {
    const [row] = await this.db
      .insert(t.evalRuns)
      .values({
        caseId: values.caseId,
        actualOutput: values.actualOutput,
        pass: values.pass,
        recall: values.recall,
        precision: values.precision,
        citationAccuracy: values.citationAccuracy,
        durationMs: values.durationMs,
        costUsd: values.costUsd,
        agentVersion: values.agentVersion ?? null,
        batchId: values.batchId ?? null,
      })
      .returning();
    return row!;
  }

  /** All runs for a set of cases (any case's history), newest first. */
  async listRunsForCases(caseIds: string[]): Promise<EvalRunRow[]> {
    if (caseIds.length === 0) return [];
    return this.db
      .select()
      .from(t.evalRuns)
      .where(inArray(t.evalRuns.caseId, caseIds))
      .orderBy(desc(t.evalRuns.ranAt));
  }

  /**
   * Newest run per case, keyed by `caseId`. One query for all cases, reduced in
   * JS (Drizzle lacks a portable DISTINCT ON helper) — fine for the handful of
   * cases a skill has.
   */
  async latestRunByCase(caseIds: string[]): Promise<Map<string, EvalRunRow>> {
    if (caseIds.length === 0) return new Map();
    const rows = await this.db
      .select()
      .from(t.evalRuns)
      .where(inArray(t.evalRuns.caseId, caseIds))
      .orderBy(desc(t.evalRuns.ranAt));
    const latest = new Map<string, EvalRunRow>();
    for (const r of rows) if (!latest.has(r.caseId)) latest.set(r.caseId, r);
    return latest;
  }
}
