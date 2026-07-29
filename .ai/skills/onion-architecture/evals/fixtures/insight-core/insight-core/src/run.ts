import type { InsightInput, InsightReport } from './types'
import { buildPrompt } from './prompt'
import { groupFindings } from './summary'
import { enrichWithOwnership } from './enrich'
import { persistReport } from './store'

export interface LLMProvider {
  complete(input: { system: string; user: string; maxTokens?: number }): Promise<string>
}

export interface RunInsightsOptions {
  llm: LLMProvider
  onProgress?: (stage: string) => void
}

export async function runInsights(
  input: InsightInput,
  options: RunInsightsOptions,
): Promise<InsightReport> {
  const { llm, onProgress } = options

  onProgress?.('grouping')
  const groups = groupFindings(input.findings)

  onProgress?.('ownership')
  const enriched = await enrichWithOwnership(groups, input.repoFullName)

  onProgress?.('prompting')
  const prompt = buildPrompt(enriched, input.windowDays)

  onProgress?.('llm')
  const raw = await llm.complete({ system: prompt.system, user: prompt.user, maxTokens: 2048 })

  const report: InsightReport = {
    repoFullName: input.repoFullName,
    windowDays: input.windowDays,
    themes: parseThemes(raw),
    groups: enriched,
  }

  onProgress?.('persist')
  await persistReport(report)

  return report
}

function parseThemes(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter((line) => line.length > 0)
    .slice(0, 10)
}
