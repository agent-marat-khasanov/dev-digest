import type { ReportSummaryDto } from '../../vendor/shared/contracts/report'

export interface ReportRenderer {
  renderHtml(summary: ReportSummaryDto): string
}

export class TableReportRenderer implements ReportRenderer {
  renderHtml(summary: ReportSummaryDto): string {
    const rows = summary.findingCounts
      .map((c) => `<tr><td>${escapeHtml(c.severity)}</td><td>${c.count}</td></tr>`)
      .join('')
    return [
      `<h1>Report for ${escapeHtml(summary.repoId)}</h1>`,
      `<p>${summary.totalRuns} runs, ${summary.totalFindings} findings (${escapeHtml(summary.period)})</p>`,
      `<table><thead><tr><th>Severity</th><th>Count</th></tr></thead><tbody>${rows}</tbody></table>`,
    ].join('\n')
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
