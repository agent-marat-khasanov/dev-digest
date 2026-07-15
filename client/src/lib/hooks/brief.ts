/* hooks/brief.ts — TanStack Query hooks for the PR Why + Risk brief card. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Brief } from "@devdigest/shared";

/** Cached-or-generate brief. POST endpoint (generation side-effect), used as the query's fetcher. */
export function useBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["brief", prId],
    queryFn: () => api.post<Brief>(`/pulls/${prId}/brief`),
    enabled: !!prId,
  });
}

/** Force a fresh brief generation (cache bypass) and seed the cache with it. */
export function useRegenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Brief>(`/pulls/${prId}/brief/regenerate`),
    onSuccess: (data) => qc.setQueryData(["brief", prId], data),
  });
}
