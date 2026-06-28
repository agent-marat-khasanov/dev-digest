/* hooks/intent.ts — TanStack Query hooks for the PR intent panel. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentRecord } from "@devdigest/shared";

export function useIntent(prId: string | undefined) {
  return useQuery({
    queryKey: ["intent", prId],
    queryFn: () => api.get<PrIntentRecord>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/** Force a fresh intent generation (cache bypass) and seed the cache with it. */
export function useRecalculateIntent(prId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentRecord>(`/pulls/${prId}/intent/recalculate`),
    onSuccess: (data) => qc.setQueryData(["intent", prId], data),
  });
}
