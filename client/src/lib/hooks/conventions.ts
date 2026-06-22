/* hooks/conventions.ts — React Query hooks for the Conventions extractor. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Convention,
  ConventionStatus,
  ExtractConventionsResult,
  Skill,
  UpdateConventionInput,
} from "@devdigest/shared";

function conventionsKey(repoId: string | null | undefined) {
  return ["conventions", repoId] as const;
}

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: conventionsKey(repoId),
    queryFn: () => api.get<Convention[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<ExtractConventionsResult>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data) => {
      qc.setQueryData(conventionsKey(repoId), data.conventions);
    },
  });
}

export interface UpdateConventionVars {
  id: string;
  patch: UpdateConventionInput;
}

/**
 * Patch a convention (status / rule / category / evidence). Accept-reject is
 * applied optimistically so the card flips state instantly; the snapshot is
 * restored if the request fails.
 */
export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateConventionVars) =>
      api.patch<Convention>(`/conventions/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: conventionsKey(repoId) });
      const previous = qc.getQueryData<Convention[]>(conventionsKey(repoId));
      if (previous) {
        qc.setQueryData<Convention[]>(
          conventionsKey(repoId),
          previous.map((c) => (c.id === id ? applyPatch(c, patch) : c)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(conventionsKey(repoId), ctx.previous);
    },
    onSuccess: (updated) => {
      qc.setQueryData<Convention[]>(conventionsKey(repoId), (prev) =>
        prev ? prev.map((c) => (c.id === updated.id ? updated : c)) : prev,
      );
    },
  });
}

export function useDeleteConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/conventions/${id}`),
    onSuccess: (_d, id) => {
      qc.setQueryData<Convention[]>(conventionsKey(repoId), (prev) =>
        prev ? prev.filter((c) => c.id !== id) : prev,
      );
    },
  });
}

export interface CreateSkillFromConventionsVars {
  repo_id: string;
  skill_name: string;
  description: string;
  enabled?: boolean;
}

export function useCreateSkillFromConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillFromConventionsVars) =>
      api.post<Skill>("/conventions/create-skill", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

function applyPatch(c: Convention, patch: UpdateConventionInput): Convention {
  return {
    ...c,
    ...(patch.status !== undefined ? { status: patch.status as ConventionStatus } : {}),
    ...(patch.category !== undefined ? { category: patch.category } : {}),
    ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
    ...(patch.evidence !== undefined ? { evidence: patch.evidence } : {}),
  };
}
