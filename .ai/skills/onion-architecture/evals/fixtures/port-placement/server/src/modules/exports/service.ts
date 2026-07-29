import type { Clock } from '../../adapters/clock'
import { FsArchiveStore } from '../../adapters/archive/fs'
import type { ExportsRepository } from './repository'
import { toExportDto, renderFindingsPdf } from './helpers'
import type { ExportDto } from '../../vendor/shared/contracts/export'

export class ExportsService {
  constructor(
    private readonly repository: ExportsRepository,
    private readonly clock: Clock,
  ) {}

  async exportRunFindings(workspaceId: string, runId: string): Promise<ExportDto> {
    const run = await this.repository.getRun(workspaceId, runId)
    const rows = await this.repository.listFindings(runId)

    const pdf = renderFindingsPdf(run, rows)
    const key = `${workspaceId}/${runId}/${this.clock.todayUtc()}.pdf`

    const archive = new FsArchiveStore(
      process.env.ARCHIVE_DIR ?? '/var/lib/devdigest/exports',
      process.env.EXPORT_SIGNING_SECRET ?? 'dev-secret',
    )
    await archive.put(key, pdf, 'application/pdf')
    const downloadUrl = await archive.presign(key, 3600)

    return toExportDto(run, rows.length, downloadUrl)
  }
}
