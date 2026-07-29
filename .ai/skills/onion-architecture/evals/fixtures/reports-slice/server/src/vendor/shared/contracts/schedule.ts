import { z } from 'zod'
import { reportPeriodSchema } from './common'

export const scheduleFrequencySchema = z.enum(['daily', 'weekly', 'monthly'])

export const scheduleSchema = z.object({
  id: z.string().uuid(),
  repoId: z.string().uuid(),
  period: reportPeriodSchema,
  frequency: scheduleFrequencySchema,
  recipients: z.array(z.string().email()).min(1),
  enabled: z.boolean(),
  nextRunAt: z.string().datetime(),
})

export type ScheduleDto = z.infer<typeof scheduleSchema>

export const createScheduleSchema = scheduleSchema.omit({ id: true, nextRunAt: true })
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>
