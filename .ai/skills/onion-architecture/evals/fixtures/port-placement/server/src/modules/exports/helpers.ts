import type { ExportDto } from '../../vendor/shared/contracts/export'
import type { FindingRow, ReviewRunRow } from './repository'

export function toExportDto(run: ReviewRunRow, findingCount: number, downloadUrl: string): ExportDto {
  return {
    runId: run.id,
    repoId: run.repoId,
    findingCount,
    downloadUrl,
  }
}

export function renderFindingsPdf(run: ReviewRunRow, rows: FindingRow[]): Buffer {
  const lines = [
    `Review run ${run.id}`,
    `Findings: ${rows.length}`,
    ...rows.map((r) => `${r.severity.toUpperCase()} ${r.file}: ${r.title}`),
  ]
  return Buffer.from(lines.join('\n'), 'utf8')
}
