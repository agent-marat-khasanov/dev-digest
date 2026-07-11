/* hooks/blast.ts — TanStack Query hook for the Blast Radius panel.
   GET /pulls/:id/blast → BlastRadius (changed symbols → callers → endpoints/crons).
   Reads the repo-intel index only; no LLM. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadius } from "@devdigest/shared";

export function useBlast(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast", prId],
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
