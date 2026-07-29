import { eq } from 'drizzle-orm'
import { db } from '../../server/src/db/client'
import { insightReports } from '../../server/src/db/schema'
import type { InsightReport } from './types'

export async function persistReport(report: InsightReport): Promise<void> {
  const existing = await db
    .select()
    .from(insightReports)
    .where(eq(insightReports.repoFullName, report.repoFullName))
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(insightReports)
      .set({ themes: report.themes, groups: report.groups, updatedAt: new Date() })
      .where(eq(insightReports.repoFullName, report.repoFullName))
    return
  }

  await db.insert(insightReports).values({
    repoFullName: report.repoFullName,
    windowDays: report.windowDays,
    themes: report.themes,
    groups: report.groups,
  })
}
