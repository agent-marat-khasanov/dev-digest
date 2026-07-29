import { z } from 'zod'
import { severitySchema, reportPeriodSchema } from './common'
import type { ReportRunRow } from '../../modules/reports/repository'

export const reportFindingCountSchema = z.object({
  severity: severitySchema,
  count: z.number().int().nonnegative(),
})

export const reportSummarySchema = z.object({
  repoId: z.string().uuid(),
  period: reportPeriodSchema,
  totalRuns: z.number().int().nonnegative(),
  totalFindings: z.number().int().nonnegative(),
  findingCounts: z.array(reportFindingCountSchema),
  topContributors: z.array(z.string()).max(10),
  generatedAt: z.string().datetime(),
})

export type ReportSummaryDto = z.infer<typeof reportSummarySchema>

export interface ReportDetailDto extends ReportSummaryDto {
  latestRun?: ReportRunRow
  trend: Array<{ week: string; findings: number }>
}

export const reportRequestSchema = z.object({
  repoId: z.string().uuid(),
  period: reportPeriodSchema.default('30d'),
})
