import { and, eq } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { reportSchedules } from '../../db/schema'
import type { CreateScheduleInput } from '../../vendor/shared/contracts/schedule'

export type ScheduleRow = typeof reportSchedules.$inferSelect

export class SchedulesRepository {
  constructor(private readonly db: Db) {}

  async listByWorkspace(workspaceId: string): Promise<ScheduleRow[]> {
    return this.db.select().from(reportSchedules).where(eq(reportSchedules.workspaceId, workspaceId))
  }

  async insert(workspaceId: string, input: CreateScheduleInput, nextRunAt: Date): Promise<ScheduleRow> {
    const rows = await this.db
      .insert(reportSchedules)
      .values({ ...input, workspaceId, nextRunAt })
      .returning()
    return rows[0]
  }

  async deleteById(workspaceId: string, scheduleId: string): Promise<void> {
    await this.db
      .delete(reportSchedules)
      .where(and(eq(reportSchedules.workspaceId, workspaceId), eq(reportSchedules.id, scheduleId)))
  }
}
