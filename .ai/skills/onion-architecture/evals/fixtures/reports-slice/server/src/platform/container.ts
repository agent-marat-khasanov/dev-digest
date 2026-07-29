import type { Db } from '../db/client'
import { createDb } from '../db/client'
import type { Clock } from '../adapters/clock'
import { SystemClock } from '../adapters/clock'
import type { ReportRenderer } from '../adapters/report-renderer'
import { TableReportRenderer } from '../adapters/report-renderer'
import { ReportsService } from '../modules/reports/service'
import { SchedulesService } from '../modules/schedules/service'
import { loadConfig, type AppConfig } from './config'

export interface ContainerOverrides {
  db?: Db
  clock?: Clock
  reportRenderer?: ReportRenderer
}

export class Container {
  readonly config: AppConfig
  readonly db: Db
  readonly clock: Clock
  readonly reportRenderer: ReportRenderer

  private _reportsService?: ReportsService
  private _schedulesService?: SchedulesService

  constructor(overrides: ContainerOverrides = {}) {
    this.config = loadConfig()
    this.db = overrides.db ?? createDb(this.config.databaseUrl)
    this.clock = overrides.clock ?? new SystemClock()
    this.reportRenderer = overrides.reportRenderer ?? new TableReportRenderer()
  }

  get reportsService(): ReportsService {
    return (this._reportsService ??= new ReportsService(this))
  }

  get schedulesService(): SchedulesService {
    return (this._schedulesService ??= new SchedulesService(this))
  }
}
