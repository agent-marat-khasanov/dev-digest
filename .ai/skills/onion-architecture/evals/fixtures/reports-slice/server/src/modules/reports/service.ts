import type { Container } from '../../platform/container'
import { ReportsRepository } from './repository'
import { toReportSummaryDto, toReportDetailDto, weeklyTrend } from './helpers'
import type { ReportPeriod } from '../../vendor/shared/contracts/common'
import type { ReportSummaryDto, ReportDetailDto } from '../../vendor/shared/contracts/report'

const PERIOD_DAYS: Record<ReportPeriod, number> = { '7d': 7, '30d': 30, '90d': 90 }

export class ReportsService {
  private readonly repo: ReportsRepository

  constructor(private readonly container: Container) {
    this.repo = new ReportsRepository(container.db)
  }

  async buildSummary(workspaceId: string, repoId: string, period: ReportPeriod): Promise<ReportSummaryDto> {
    const days = PERIOD_DAYS[period]
    const runs = await this.repo.listRuns(workspaceId, repoId, days)
    const counts = await this.repo.countFindingsBySeverity(workspaceId, repoId, days)
    const contributors = await this.repo.topContributors(workspaceId, repoId, days)
    return toReportSummaryDto(repoId, period, runs, counts, contributors, this.container.clock.now())
  }

  async buildDetail(workspaceId: string, repoId: string, period: ReportPeriod): Promise<ReportDetailDto> {
    const summary = await this.buildSummary(workspaceId, repoId, period)
    const runs = await this.repo.listRuns(workspaceId, repoId, PERIOD_DAYS[period])
    return toReportDetailDto(summary, runs[0], weeklyTrend(runs))
  }
}
