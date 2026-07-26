/* useAgentVersionSnapshot — tiny read hook over the existing
   GET /agents/:id/versions/:version endpoint (server/src/modules/agents/routes.ts).
   Only the `system_prompt` field is needed for the Compare prompt diff; the
   shared `AgentVersion` contract carries the full config snapshot. */
"use client";

import { useQuery } from "@tanstack/react-query";
import type { AgentVersion } from "@devdigest/shared";
import { api } from "@/lib/api";

export function useAgentVersionSnapshot(agentId: string, version: number | null) {
  return useQuery({
    queryKey: ["agent", agentId, "version", version],
    queryFn: () => api.get<AgentVersion>(`/agents/${agentId}/versions/${version}`),
    enabled: version != null,
  });
}
