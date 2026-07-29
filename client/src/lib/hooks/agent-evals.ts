/* hooks/agent-evals.ts — React Query hooks for an agent's eval cases + runs
   (Agent Editor → Evals tab) and the workspace-wide eval dashboard
   (sidebar → Eval Dashboard page). Mirrors hooks/evals.ts (skill evals). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentVersion,
  EvalCase,
  EvalCaseInput,
  EvalCaseMintPreview,
  EvalCaseSummary,
  EvalDashboard,
  EvalDashboardOverview,
  EvalRunRecord,
} from "@devdigest/shared";

function agentEvalsKey(agentId: string) {
  return ["agent", agentId, "evals"] as const;
}

function agentEvalDashboardKey(agentId: string) {
  return ["agent", agentId, "eval-dashboard"] as const;
}

function agentEvalRunsKey(agentId: string) {
  return ["agent", agentId, "eval-runs"] as const;
}

const evalDashboardOverviewKey = ["eval-dashboard"] as const;

export function useAgentEvals(agentId: string | null | undefined) {
  return useQuery({
    queryKey: agentEvalsKey(agentId ?? ""),
    queryFn: () => api.get<EvalCaseSummary[]>(`/agents/${agentId}/evals`),
    enabled: !!agentId,
  });
}

export function useAgentEvalRunsEstimate(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent", agentId, "eval-runs-estimate"],
    queryFn: () =>
      api.get<{ case_count: number; estimated_cost_usd: number }>(
        `/agents/${agentId}/eval-runs/estimate`
      ),
    enabled: !!agentId,
  });
}

export function useRunAgentEvals(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<EvalCaseSummary[]>(`/agents/${agentId}/eval-runs`, { confirm: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentEvalsKey(agentId) });
      qc.invalidateQueries({ queryKey: agentEvalDashboardKey(agentId) });
      qc.invalidateQueries({ queryKey: agentEvalRunsKey(agentId) });
    },
  });
}

export function useRunAgentEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) =>
      api.post<EvalCaseSummary>(`/agents/${agentId}/evals/${caseId}/run`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentEvalsKey(agentId) });
      qc.invalidateQueries({ queryKey: agentEvalDashboardKey(agentId) });
      qc.invalidateQueries({ queryKey: agentEvalRunsKey(agentId) });
    },
  });
}

export function useAgentEvalCase(agentId: string | null | undefined, caseId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent", agentId, "evals", caseId],
    queryFn: () => api.get<EvalCase>(`/agents/${agentId}/evals/${caseId}`),
    enabled: !!agentId && !!caseId,
  });
}

export function useCreateAgentEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EvalCaseInput) => api.post<EvalCase>(`/agents/${agentId}/evals`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentEvalsKey(agentId) }),
  });
}

export function useUpdateAgentEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, patch }: { caseId: string; patch: Partial<EvalCaseInput> }) =>
      api.patch<EvalCase>(`/agents/${agentId}/evals/${caseId}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentEvalsKey(agentId) }),
  });
}

export function useDeleteAgentEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.del<{ ok: boolean }>(`/agents/${agentId}/evals/${caseId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentEvalsKey(agentId) }),
  });
}

export function useAgentEvalDashboard(agentId: string | null | undefined) {
  return useQuery({
    queryKey: agentEvalDashboardKey(agentId ?? ""),
    queryFn: () => api.get<EvalDashboard>(`/agents/${agentId}/eval-dashboard`),
    enabled: !!agentId,
  });
}

export function useAgentEvalRuns(agentId: string | null | undefined) {
  return useQuery({
    queryKey: agentEvalRunsKey(agentId ?? ""),
    queryFn: () => api.get<EvalRunRecord[]>(`/agents/${agentId}/eval-runs`),
    enabled: !!agentId,
  });
}

export function useMintEvalCasePreview(findingId: string | null) {
  return useQuery({
    queryKey: ["findings", findingId, "eval-case", "preview"],
    queryFn: () => api.get<EvalCaseMintPreview>(`/findings/${findingId}/eval-case/preview`),
    enabled: !!findingId,
  });
}

export function useMintEvalCaseFromFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) => api.post<EvalCase>(`/findings/${findingId}/eval-case`),
    onSuccess: (evalCase) => {
      qc.invalidateQueries({ queryKey: agentEvalsKey(evalCase.owner_id) });
    },
  });
}

export function useEvalDashboardOverview() {
  return useQuery({
    queryKey: evalDashboardOverviewKey,
    queryFn: () => api.get<EvalDashboardOverview>("/eval-dashboard"),
  });
}

export function useEvalRunsEstimate() {
  return useQuery({
    queryKey: ["eval-runs-estimate"],
    queryFn: () =>
      api.get<{ agent_count: number; case_count: number; estimated_cost_usd: number }>(
        "/eval-runs/estimate"
      ),
  });
}

export function useRunAllAgentEvals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalDashboardOverview>("/eval-runs", { confirm: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: evalDashboardOverviewKey }),
  });
}

/** One agent config snapshot (GET /agents/:id/versions/:version) — used by
 * the Compare modal's system-prompt diff and its "Promote" action. */
export function useAgentVersionSnapshot(agentId: string, version: number | null) {
  return useQuery({
    queryKey: ["agent", agentId, "version", version],
    queryFn: () => api.get<AgentVersion>(`/agents/${agentId}/versions/${version}`),
    enabled: version != null,
  });
}
