import type { ScheduleDto } from '../../vendor/shared/contracts/schedule'
import type { ScheduleRow } from './repository'

export function toScheduleDto(row: ScheduleRow): ScheduleDto {
  return {
    id: row.id,
    repoId: row.repoId,
    period: row.period,
    frequency: row.frequency,
    recipients: row.recipients,
    enabled: row.enabled,
    nextRunAt: row.nextRunAt.toISOString(),
  }
}

export function nextRunAt(frequency: ScheduleDto['frequency'], from: Date): Date {
  const next = new Date(from)
  if (frequency === 'daily') next.setUTCDate(next.getUTCDate() + 1)
  if (frequency === 'weekly') next.setUTCDate(next.getUTCDate() + 7)
  if (frequency === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1)
  next.setUTCHours(6, 0, 0, 0)
  return next
}
