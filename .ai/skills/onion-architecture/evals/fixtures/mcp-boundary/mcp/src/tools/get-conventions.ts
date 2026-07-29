import { and, eq } from 'drizzle-orm'
import { db } from '../../../server/src/db/client'
import { conventions, repos } from '../../../server/src/db/schema'

export interface ConventionSummary {
  id: string
  rule: string
  status: string
}

export async function getConventions(owner: string, repo: string): Promise<ConventionSummary[]> {
  const fullName = `${owner}/${repo}`
  const repoRows = await db.select().from(repos).where(eq(repos.fullName, fullName)).limit(1)
  if (repoRows.length === 0) return []

  const rows = await db
    .select()
    .from(conventions)
    .where(and(eq(conventions.repoId, repoRows[0].id), eq(conventions.status, 'accepted')))

  return rows.map((row) => ({ id: row.id, rule: row.rule, status: row.status }))
}
