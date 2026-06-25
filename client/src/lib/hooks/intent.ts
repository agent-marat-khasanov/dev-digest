/* hooks/intent.ts — TanStack Query hook for the PR intent panel. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentRecord } from "@devdigest/shared";

export function useIntent(prId: string | undefined) {
  return useQuery({
    queryKey: ["intent", prId],
    queryFn: () => api.get<PrIntentRecord>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}
