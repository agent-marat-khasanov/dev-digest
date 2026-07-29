import { Container } from '../../../server/src/platform/container'
import { ReviewsService } from '../../../server/src/modules/reviews/service'

export interface FindingSummary {
  severity: string
  file: string
  title: string
}

export async function getFindings(owner: string, repo: string, prNumber: number): Promise<FindingSummary[]> {
  const container = new Container()
  const service = new ReviewsService(container)

  const run = await service.getLatestRunForPr(`${owner}/${repo}`, prNumber)
  if (!run) return []

  return run.findings.map((f) => ({ severity: f.severity, file: f.file, title: f.title }))
}
