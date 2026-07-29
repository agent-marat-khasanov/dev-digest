import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getContext } from '../../platform/context'
import { createScheduleSchema, scheduleSchema } from '../../vendor/shared/contracts/schedule'

const scheduleParams = z.object({ scheduleId: z.string().uuid() })

export function scheduleRoutes(app: FastifyInstance) {
  app.get('/schedules', async (req) => {
    const { workspaceId, container } = getContext(req)
    const schedules = await container.schedulesService.list(workspaceId)
    return schedules.map((s) => scheduleSchema.parse(s))
  })

  app.post('/schedules', async (req, reply) => {
    const input = createScheduleSchema.parse(req.body)
    const { workspaceId, container } = getContext(req)
    const created = await container.schedulesService.create(workspaceId, input)
    reply.code(201)
    return scheduleSchema.parse(created)
  })

  app.delete('/schedules/:scheduleId', async (req, reply) => {
    const { scheduleId } = scheduleParams.parse(req.params)
    const { workspaceId, container } = getContext(req)
    await container.schedulesService.remove(workspaceId, scheduleId)
    reply.code(204)
  })
}
