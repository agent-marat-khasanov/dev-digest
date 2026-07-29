import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getContext } from '../../platform/context'
import { exportSchema } from '../../vendor/shared/contracts/export'

const exportParams = z.object({ runId: z.string().uuid() })

export function exportRoutes(app: FastifyInstance) {
  app.post('/runs/:runId/export', async (req) => {
    const { runId } = exportParams.parse(req.params)
    const { workspaceId, container } = getContext(req)
    const result = await container.exportsService.exportRunFindings(workspaceId, runId)
    return exportSchema.parse(result)
  })
}
