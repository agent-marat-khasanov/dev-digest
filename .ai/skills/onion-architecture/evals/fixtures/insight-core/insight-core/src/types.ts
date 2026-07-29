export interface FindingRecord {
  file: string
  severity: 'critical' | 'warning' | 'info'
  category: string
  title: string
  runId: string
}

export interface InsightInput {
  repoFullName: string
  windowDays: number
  findings: FindingRecord[]
}

export interface FindingGroup {
  category: string
  count: number
  files: string[]
  owners?: string[]
}

export interface InsightReport {
  repoFullName: string
  windowDays: number
  themes: string[]
  groups: FindingGroup[]
}
