/* hooks/onboarding.ts — TanStack Query hooks for the Onboarding Tour page. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { OnboardingTour } from "@devdigest/shared";

export function useTour(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["tour", repoId],
    queryFn: () => api.get<OnboardingTour>(`/repos/${repoId}/tour`),
    enabled: !!repoId,
  });
}

/** Force a fresh tour generation for the current indexed SHA (AC-15) and replace the cached tour. */
export function useRegenerateTour(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<OnboardingTour>(`/repos/${repoId}/tour/regenerate`),
    onSuccess: (data) => qc.setQueryData(["tour", repoId], data),
  });
}
