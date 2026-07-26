/* useAgentVersionSnapshot — tiny read hook over the existing
   GET /agents/:id/versions/:version endpoint (server/src/modules/agents/routes.ts).
   Only the `system_prompt` field is needed for the Compare prompt diff, so this
   declares a local type rather than widening the shared `eval-ci.ts` contract
   (the client vendor/shared copy doesn't yet mirror server's AgentVersion/
   AgentVersionConfig — out of this task's scope to add). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface AgentVersionSnapshot {
  agent_id: string;
  version: number;
  config: { system_prompt: string };
  created_at: string;
}

export function useAgentVersionSnapshot(agentId: string, version: number | null) {
  return useQuery({
    queryKey: ["agent", agentId, "version", version],
    queryFn: () => api.get<AgentVersionSnapshot>(`/agents/${agentId}/versions/${version}`),
    enabled: version != null,
  });
}
