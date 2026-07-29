import type { ReportPeriod } from '../../vendor/shared/contracts/common'
import type { ReportSummaryDto, ReportDetailDto } from '../../vendor/shared/contracts/report'
import type { ReportRunRow, SeverityCount } from './repository'

export function toReportSummaryDto(
  repoId: string,
  period: ReportPeriod,
  runs: ReportRunRow[],
  counts: SeverityCount[],
  contributors: string[],
  now: Date,
): ReportSummaryDto {
  return {
    repoId,
    period,
    totalRuns: runs.length,
    totalFindings: counts.reduce((sum, c) => sum + c.count, 0),
    findingCounts: counts.map((c) => ({ severity: c.severity as ReportSummaryDto['findingCounts'][number]['severity'], count: c.count })),
    topContributors: contributors,
    generatedAt: now.toISOString(),
  }
}

export function toReportDetailDto(
  summary: ReportSummaryDto,
  latestRun: ReportRunRow | undefined,
  trend: Array<{ week: string; findings: number }>,
): ReportDetailDto {
  return { ...summary, latestRun, trend }
}

export function weeklyTrend(runs: ReportRunRow[]): Array<{ week: string; findings: number }> {
  const byWeek = new Map<string, number>()
  for (const run of runs) {
    const week = isoWeek(run.createdAt)
    byWeek.set(week, (byWeek.get(week) ?? 0) + run.findingCount)
  }
  return [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, findings]) => ({ week, findings }))
}

function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
