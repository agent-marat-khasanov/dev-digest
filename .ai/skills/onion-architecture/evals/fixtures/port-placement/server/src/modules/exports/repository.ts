import { and, eq } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { findings, reviewRuns } from '../../db/schema'

export type ReviewRunRow = typeof reviewRuns.$inferSelect
export type FindingRow = typeof findings.$inferSelect

export class ExportsRepository {
  constructor(private readonly db: Db) {}

  async getRun(workspaceId: string, runId: string): Promise<ReviewRunRow> {
    const rows = await this.db
      .select()
      .from(reviewRuns)
      .where(and(eq(reviewRuns.workspaceId, workspaceId), eq(reviewRuns.id, runId)))
      .limit(1)
    if (rows.length === 0) throw new Error('run not found')
    return rows[0]
  }

  async listFindings(runId: string): Promise<FindingRow[]> {
    return this.db.select().from(findings).where(eq(findings.runId, runId))
  }
}
