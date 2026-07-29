import type { DigestDto } from '../../vendor/shared/contracts/digest'
import type { FindingRow, ReviewRunRow } from './repository'

export function toDigestDto(runs: ReviewRunRow[], rows: FindingRow[]): DigestDto {
  const bySeverity: Record<string, number> = {}
  for (const row of rows) {
    bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + 1
  }

  const counts = new Map<string, number>()
  for (const row of rows) {
    counts.set(row.file, (counts.get(row.file) ?? 0) + 1)
  }

  const topFiles = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([file, count]) => ({ file, count }))

  return {
    totalRuns: runs.length,
    totalFindings: rows.length,
    bySeverity,
    topFiles,
    generatedAt: new Date().toISOString(),
  }
}
