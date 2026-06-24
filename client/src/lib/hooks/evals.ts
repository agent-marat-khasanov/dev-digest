/* hooks/evals.ts — React Query hooks for a skill's eval cases (Skill → Evals tab). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { EvalCaseSummary } from "@devdigest/shared";

function evalsKey(skillId: string) {
  return ["skill", skillId, "evals"] as const;
}

export function useSkillEvals(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", skillId, "evals"],
    queryFn: () => api.get<EvalCaseSummary[]>(`/skills/${skillId}/evals`),
    enabled: !!skillId,
  });
}

export function useRunSkillEval(skillId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) =>
      api.post<EvalCaseSummary>(`/skills/${skillId}/evals/${caseId}/run`),
    onSuccess: () => qc.invalidateQueries({ queryKey: evalsKey(skillId) }),
  });
}

export function useRunAllSkillEvals(skillId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalCaseSummary[]>(`/skills/${skillId}/evals/run`),
    onSuccess: () => qc.invalidateQueries({ queryKey: evalsKey(skillId) }),
  });
}

export function useDeleteSkillEval(skillId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.del<{ ok: boolean }>(`/skills/${skillId}/evals/${caseId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: evalsKey(skillId) }),
  });
}
