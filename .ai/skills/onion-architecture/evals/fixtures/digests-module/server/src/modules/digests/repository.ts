import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { findings, reviewRuns } from '../../db/schema'

export type ReviewRunRow = typeof reviewRuns.$inferSelect
export type FindingRow = typeof findings.$inferSelect

export class DigestsRepository {
  constructor(private readonly db: Db) {}

  async listRecentRuns(workspaceId: string, repoId: string, days: number): Promise<ReviewRunRow[]> {
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

  async listFindingsForRuns(runIds: string[]): Promise<FindingRow[]> {
    if (runIds.length === 0) return []
    return this.db.select().from(findings).where(inArray(findings.runId, runIds))
  }
}
