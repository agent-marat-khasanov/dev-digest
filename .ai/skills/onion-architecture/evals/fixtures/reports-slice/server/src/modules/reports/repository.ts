import { and, desc, eq, gte, sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { findings, reviewRuns } from '../../db/schema'

export type ReportRunRow = typeof reviewRuns.$inferSelect
export type ReportFindingRow = typeof findings.$inferSelect

export interface SeverityCount {
  severity: string
  count: number
}

export class ReportsRepository {
  constructor(private readonly db: Db) {}

  async listRuns(workspaceId: string, repoId: string, days: number): Promise<ReportRunRow[]> {
    const since = sql`now() - make_interval(days => ${days})`
    return this.db
      .select()
      .from(reviewRuns)
      .where(
        and(
          eq(reviewRuns.workspaceId, workspaceId),
          eq(reviewRuns.repoId, repoId),
          gte(reviewRuns.createdAt, since),
        ),
      )
      .orderBy(desc(reviewRuns.createdAt))
  }

  async countFindingsBySeverity(workspaceId: string, repoId: string, days: number): Promise<SeverityCount[]> {
    const since = sql`now() - make_interval(days => ${days})`
    const rows = await this.db
      .select({ severity: findings.severity, count: sql<number>`count(*)::int` })
      .from(findings)
      .innerJoin(reviewRuns, eq(findings.runId, reviewRuns.id))
      .where(
        and(
          eq(reviewRuns.workspaceId, workspaceId),
          eq(reviewRuns.repoId, repoId),
          gte(reviewRuns.createdAt, since),
        ),
      )
      .groupBy(findings.severity)
    return rows
  }

  async topContributors(workspaceId: string, repoId: string, days: number): Promise<string[]> {
    const since = sql`now() - make_interval(days => ${days})`
    const rows = await this.db
      .select({ author: reviewRuns.author })
      .from(reviewRuns)
      .where(
        and(
          eq(reviewRuns.workspaceId, workspaceId),
          eq(reviewRuns.repoId, repoId),
          gte(reviewRuns.createdAt, since),
        ),
      )
      .groupBy(reviewRuns.author)
      .orderBy(desc(sql`count(*)`))
      .limit(10)
    return rows.map((r) => r.author)
  }
}
