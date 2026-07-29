import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getContext } from '../../platform/context'
import { DigestsRepository } from './repository'

const digestParams = z.object({ repoId: z.string().uuid() })

const digestQuery = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
})

export function digestRoutes(app: FastifyInstance) {
  app.get('/repos/:repoId/digest', async (req) => {
    const { repoId } = digestParams.parse(req.params)
    const { days } = digestQuery.parse(req.query)
    const { workspaceId, container } = getContext(req)

    const repository = new DigestsRepository(container.db)
    const runs = await repository.listRecentRuns(workspaceId, repoId, days)
    const findings = await repository.listFindingsForRuns(runs.map((r) => r.id))

    const bySeverity: Record<string, number> = {}
    for (const finding of findings) {
      bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1
    }

    const topFiles = Object.entries(
      findings.reduce<Record<string, number>>((acc, f) => {
        acc[f.file] = (acc[f.file] ?? 0) + 1
        return acc
      }, {}),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([file, count]) => ({ file, count }))

    return {
      runs,
      findings,
      summary: { bySeverity, topFiles, totalRuns: runs.length },
    }
  })
}
