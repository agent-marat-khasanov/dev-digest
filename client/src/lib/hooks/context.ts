/* hooks/context.ts — React Query hooks for Project Context: repo doc discovery
   + on-demand preview, plus agent/skill attachment links. Mirrors hooks/skills.ts
   (useAgentSkills/useSetAgentSkills) for the link CRUD pattern. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentContextLink,
  ContextDoc,
  ContextPreview,
  SetContextBody,
  SkillContextLink,
} from "@devdigest/shared";

// ---------------------------------------------------------------------------
// /repos/:repoId/context — fresh, uncached walk per request (AC-7). Rescan is
// simply invalidating/refetching this query — there is no reindex endpoint.
// ---------------------------------------------------------------------------

export function useContextFiles(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context", repoId],
    queryFn: () => api.get<ContextDoc[]>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

export function useReindexContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => qc.refetchQueries({ queryKey: ["context", repoId] }),
  });
}

// ---------------------------------------------------------------------------
// /repos/:repoId/context/preview — on-demand per-doc preview (POST so a
// repo-relative path with "/" needs no URL encoding).
// ---------------------------------------------------------------------------

export function useContextPreview(
  repoId: string | null | undefined,
  path: string | null | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["context-preview", repoId, path],
    queryFn: () => api.post<ContextPreview>(`/repos/${repoId}/context/preview`, { path }),
    enabled: enabled && !!repoId && !!path,
  });
}

// ---------------------------------------------------------------------------
// /agents/:id/context — bindings (ordered, paths only). Replaces the whole
// set on save, mirroring useAgentSkills/useSetAgentSkills.
// ---------------------------------------------------------------------------

export function useAgentContext(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent", agentId, "context"],
    queryFn: () => api.get<AgentContextLink[]>(`/agents/${agentId}/context`),
    enabled: !!agentId,
  });
}

export function useSetAgentContext(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetContextBody) =>
      api.post<AgentContextLink[]>(`/agents/${agentId}/context`, input),
    onSuccess: (data) => {
      qc.setQueryData(["agent", agentId, "context"], data);
    },
  });
}

// ---------------------------------------------------------------------------
// /skills/:id/context — bindings (ordered, paths only), inherited by any
// agent using the skill (when enabled).
// ---------------------------------------------------------------------------

export function useSkillContext(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", skillId, "context"],
    queryFn: () => api.get<SkillContextLink[]>(`/skills/${skillId}/context`),
    enabled: !!skillId,
  });
}

export function useSetSkillContext(skillId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetContextBody) =>
      api.post<SkillContextLink[]>(`/skills/${skillId}/context`, input),
    onSuccess: (data) => {
      qc.setQueryData(["skill", skillId, "context"], data);
    },
  });
}
