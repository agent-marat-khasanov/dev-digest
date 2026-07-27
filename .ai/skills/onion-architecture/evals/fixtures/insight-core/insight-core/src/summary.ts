import pino from 'pino'
import type { FindingGroup, FindingRecord } from './types'

const logger = pino({ name: 'insight-core' })

export function groupFindings(findings: FindingRecord[]): FindingGroup[] {
  const byCategory = new Map<string, FindingRecord[]>()

  for (const finding of findings) {
    const bucket = byCategory.get(finding.category) ?? []
    bucket.push(finding)
    byCategory.set(finding.category, bucket)
  }

  logger.info({ categories: byCategory.size }, 'grouped findings')

  return [...byCategory.entries()]
    .map(([category, rows]) => ({
      category,
      count: rows.length,
      files: [...new Set(rows.map((r) => r.file))],
    }))
    .sort((a, b) => b.count - a.count)
}
