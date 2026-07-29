import { z } from 'zod'

export const severitySchema = z.enum(['critical', 'warning', 'suggestion'])
export type Severity = z.infer<typeof severitySchema>

export const reportPeriodSchema = z.enum(['7d', '30d', '90d'])
export type ReportPeriod = z.infer<typeof reportPeriodSchema>

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})
export type Pagination = z.infer<typeof paginationSchema>
