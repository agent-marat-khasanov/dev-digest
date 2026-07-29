import type { ApiClient } from '../client'

export interface AgentSummary {
  id: string
  name: string
  enabled: boolean
}

export async function listAgents(client: ApiClient): Promise<AgentSummary[]> {
  const agents = await client.get<AgentSummary[]>('/agents')
  return agents.filter((a) => a.enabled)
}
