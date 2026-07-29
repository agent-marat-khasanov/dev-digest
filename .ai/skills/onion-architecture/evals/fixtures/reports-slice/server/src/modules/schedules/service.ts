import type { Container } from '../../platform/container'
import { SchedulesRepository } from './repository'
import { toScheduleDto, nextRunAt } from './helpers'
import type { ScheduleDto, CreateScheduleInput } from '../../vendor/shared/contracts/schedule'

export class SchedulesService {
  private readonly repo: SchedulesRepository

  constructor(private readonly container: Container) {
    this.repo = new SchedulesRepository(container.db)
  }

  async list(workspaceId: string): Promise<ScheduleDto[]> {
    const rows = await this.repo.listByWorkspace(workspaceId)
    return rows.map(toScheduleDto)
  }

  async create(workspaceId: string, input: CreateScheduleInput): Promise<ScheduleDto> {
    const next = nextRunAt(input.frequency, this.container.clock.now())
    const row = await this.repo.insert(workspaceId, input, next)
    return toScheduleDto(row)
  }

  async remove(workspaceId: string, scheduleId: string): Promise<void> {
    await this.repo.deleteById(workspaceId, scheduleId)
  }
}
