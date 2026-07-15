import { and, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * F1 — repos data-access layer. The ONLY place that touches the `repos`
 * table. Every query is scoped by `workspaceId` (tenancy guard).
 *
 * It also READS the review-activity tables (`agent_runs` → `pull_requests`,
 * `reviews` → `findings`) for the repo stats rollup — writes to those stay with
 * the reviews module, exactly as the skills repository reads them for
 * GET /skills/:id/stats.
 */

export type RepoRow = typeof t.repos.$inferSelect;

export interface InsertRepo {
  workspaceId: string;
  owner: string;
  name: string;
  fullName: string;
  createdBy: string;
}

/** One `count(*) … GROUP BY severity` row of the findings rollup. */
export interface SeverityCount {
  severity: string;
  count: number;
}

export class RepoRepository {
  constructor(private db: Db) {}

  /** Find a repo in a workspace by its `owner/name` full name (dedupe on add). */
  async findByFullName(workspaceId: string, fullName: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, fullName)));
    return row;
  }

  async list(workspaceId: string): Promise<RepoRow[]> {
    return this.db.select().from(t.repos).where(eq(t.repos.workspaceId, workspaceId));
  }

  async getById(workspaceId: string, id: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, id)));
    return row;
  }

  async insert(values: InsertRepo): Promise<RepoRow> {
    const [row] = await this.db
      .insert(t.repos)
      .values({
        workspaceId: values.workspaceId,
        owner: values.owner,
        name: values.name,
        fullName: values.fullName,
        createdBy: values.createdBy,
      })
      .returning();
    return row!;
  }

  /**
   * Look up the workspace owning a repo (by repo id, no tenancy scope —
   * the JobRunner's `runCloneJob` is the only caller and it already trusted
   * the payload that came out of an authenticated `add()`). Returns null
   * if the repo was deleted before the followup ran.
   */
  async workspaceIdFor(repoId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ workspaceId: t.repos.workspaceId })
      .from(t.repos)
      .where(eq(t.repos.id, repoId));
    return row?.workspaceId ?? null;
  }

  /** Persist the clone path and bump `last_polled_at` once a clone job completes. */
  async updateClonePath(repoId: string, clonePath: string): Promise<void> {
    await this.db
      .update(t.repos)
      .set({ clonePath, lastPolledAt: new Date() })
      .where(eq(t.repos.id, repoId));
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, id)))
      .returning({ id: t.repos.id });
    return deleted.length > 0;
  }

  // ---- Stats data fetchers (raw counts — the DTO shaping lives in helpers) --

  /**
   * Review runs (any status — the history includes failures) fired at any PR of
   * this repo since `since`. `agent_runs` carries `workspace_id` itself, so the
   * tenancy guard holds even though the repo link goes through `pull_requests`.
   */
  async countRunsSince(workspaceId: string, repoId: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(t.agentRuns)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.agentRuns.prId))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.pullRequests.repoId, repoId),
          gte(t.agentRuns.ranAt, since),
        ),
      );
    return row?.count ?? 0;
  }

  /**
   * Findings produced by those same runs, grouped by severity. The join walks
   * findings → reviews → agent_runs → pull_requests, so a finding is counted
   * against the window of the RUN that produced it (not its own timestamp — it
   * has none). `kind='review'` mirrors the per-run severity rollup in the
   * reviews repository: a `summary` review never carries findings of its own,
   * and filtering here keeps it that way if that ever changes.
   */
  async findingsBySeveritySince(
    workspaceId: string,
    repoId: string,
    since: Date,
  ): Promise<SeverityCount[]> {
    return this.db
      .select({ severity: t.findings.severity, count: sql<number>`count(*)::int` })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.reviews.runId))
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.agentRuns.prId))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.pullRequests.repoId, repoId),
          eq(t.reviews.kind, 'review'),
          gte(t.agentRuns.ranAt, since),
        ),
      )
      .groupBy(t.findings.severity);
  }
}
