import type { FindingGroup } from './types'

export interface InsightPrompt {
  system: string
  user: string
}

export function buildPrompt(groups: FindingGroup[], windowDays: number): InsightPrompt {
  const lines = groups.map(
    (g) => `- ${g.category}: ${g.count} findings across ${g.files.length} files`,
  )

  return {
    system:
      'You are an engineering-insights assistant. Given grouped code-review findings, ' +
      'name the dominant quality themes in plain language. Return one theme per line.',
    user: `Findings from the last ${windowDays} days:\n${lines.join('\n')}`,
  }
}
