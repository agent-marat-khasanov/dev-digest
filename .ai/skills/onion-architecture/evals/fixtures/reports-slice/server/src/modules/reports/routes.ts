import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getContext } from '../../platform/context'
import { reportRequestSchema, reportSummarySchema } from '../../vendor/shared/contracts/report'

const reportParams = z.object({ repoId: z.string().uuid() })

export function reportRoutes(app: FastifyInstance) {
  app.get('/repos/:repoId/reports/summary', async (req) => {
    const { repoId } = reportParams.parse(req.params)
    const { period } = reportRequestSchema.pick({ period: true }).parse(req.query)
    const { workspaceId, container } = getContext(req)

    const summary = await container.reportsService.buildSummary(workspaceId, repoId, period)
    return reportSummarySchema.parse(summary)
  })

  app.get('/repos/:repoId/reports/detail', async (req) => {
    const { repoId } = reportParams.parse(req.params)
    const { period } = reportRequestSchema.pick({ period: true }).parse(req.query)
    const { workspaceId, container } = getContext(req)

    return container.reportsService.buildDetail(workspaceId, repoId, period)
  })
}
