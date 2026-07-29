import type { Db } from '../../db/client'
import { DigestsRepository } from './repository'
import { toDigestDto } from './helpers'
import type { DigestDto } from '../../vendor/shared/contracts/digest'

const MAIL_API_URL = 'https://api.resend.com/emails'

export class DigestsService {
  private readonly repository: DigestsRepository

  constructor(private readonly db: Db) {
    this.repository = new DigestsRepository(db)
  }

  async buildDigest(workspaceId: string, repoId: string, days: number): Promise<DigestDto> {
    const runs = await this.repository.listRecentRuns(workspaceId, repoId, days)
    const findings = await this.repository.listFindingsForRuns(runs.map((r) => r.id))
    return toDigestDto(runs, findings)
  }

  async sendDigest(workspaceId: string, repoId: string, recipient: string): Promise<void> {
    const digest = await this.buildDigest(workspaceId, repoId, 7)

    const response = await fetch(MAIL_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'digest@devdigest.dev',
        to: recipient,
        subject: `Weekly digest for ${repoId}`,
        html: renderDigestHtml(digest),
      }),
    })

    if (!response.ok) {
      throw new Error(`mail send failed: ${response.status}`)
    }
  }
}

function renderDigestHtml(digest: DigestDto): string {
  const rows = digest.topFiles
    .map((f) => `<tr><td>${f.file}</td><td>${f.count}</td></tr>`)
    .join('')
  return `<h1>Weekly digest</h1><p>${digest.totalRuns} runs</p><table>${rows}</table>`
}
