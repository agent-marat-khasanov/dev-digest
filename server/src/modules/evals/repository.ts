import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { EvalOwnerKind } from '@devdigest/shared';

/**
 * Eval data-access. Owns `eval_cases` and `eval_runs`. Workspace-scoped.
 * Cases are created via the DB seed for now (no create/edit route this lesson);
 * this module reads cases + persists run results.
 */

export type EvalCaseRow = typeof t.evalCases.$inferSelect;
export type EvalRunRow = typeof t.evalRuns.$inferSelect;

export interface InsertEvalRun {
  caseId: string;
  actualOutput: unknown;
  pass: boolean;
  recall: number;
  precision: number;
  citationAccuracy: number;
  durationMs: number;
  costUsd: number | null;
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
      })
      .returning();
    return row!;
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
