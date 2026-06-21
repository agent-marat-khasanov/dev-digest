/* hooks/skills.ts — React Query hooks for the Skills CRUD module + agent bindings. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentSkillLink,
  CommunitySkill,
  Skill,
  SkillImportPreview,
  SkillSource,
  SkillStats,
  SkillType,
  SkillVersion,
  SkillVersionDiff,
} from "@devdigest/shared";

// ---------------------------------------------------------------------------
// /skills CRUD
// ---------------------------------------------------------------------------

export interface SkillListFilter {
  type?: SkillType;
  enabled?: boolean;
}

function listQueryString(filter: SkillListFilter): string {
  const params = new URLSearchParams();
  if (filter.type) params.set("type", filter.type);
  if (filter.enabled !== undefined) params.set("enabled", String(filter.enabled));
  const q = params.toString();
  return q ? `?${q}` : "";
}

export function useSkills(filter: SkillListFilter = {}) {
  return useQuery({
    queryKey: ["skills", filter],
    queryFn: () => api.get<Skill[]>(`/skills${listQueryString(filter)}`),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id, "versions"],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled?: boolean;
  source?: SkillSource;
  evidence_files?: string[] | null;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled" | "evidence_files">>;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
    },
  });
}

// ---------------------------------------------------------------------------
// /skills/import/preview — upload a .md or .zip, get back a parsed preview.
// The mutation does NOT persist; the caller decides whether to follow up with
// useCreateSkill once the preview looks right.
// ---------------------------------------------------------------------------

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  // Chunked to avoid a giant call-stack on big inputs.
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function useImportSkillPreview() {
  return useMutation({
    mutationFn: async (file: File): Promise<SkillImportPreview> => {
      const content_base64 = await fileToBase64(file);
      return api.post<SkillImportPreview>("/skills/import/preview", {
        filename: file.name,
        content_base64,
      });
    },
  });
}

// ---------------------------------------------------------------------------
// /agents/:id/skills — bindings (ordered, per-link enabled). Replaces the
// whole set on save, so the SkillsTab can save reorder + toggle in one call.
// ---------------------------------------------------------------------------

export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent", agentId, "skills"],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

export interface SetAgentSkillsInput {
  links: Array<{ skill_id: string; enabled?: boolean }>;
}

export function useSetAgentSkills(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetAgentSkillsInput) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, input),
    onSuccess: (data) => {
      qc.setQueryData(["agent", agentId, "skills"], data);
    },
  });
}

// ---------------------------------------------------------------------------
// Stats, versions, and community (new for the detail-page tabs lesson).
// ---------------------------------------------------------------------------

export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id, "stats"],
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

export function useSkillVersionDiff(id: string | null | undefined, version: number | null) {
  return useQuery({
    queryKey: ["skill", id, "diff", version],
    queryFn: () => api.get<SkillVersionDiff>(`/skills/${id}/versions/${version}/diff`),
    enabled: !!id && version != null,
  });
}

export function useRestoreSkillVersion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: number) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: (data) => {
      qc.setQueryData(["skill", id], data);
      qc.invalidateQueries({ queryKey: ["skill", id, "versions"] });
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

export interface CommunityFilter {
  q?: string;
  lang?: string;
}

export function useCommunitySkills(filter: CommunityFilter = {}) {
  const params = new URLSearchParams();
  if (filter.q) params.set("q", filter.q);
  if (filter.lang) params.set("lang", filter.lang);
  const qs = params.toString();
  return useQuery({
    queryKey: ["community-skills", filter],
    queryFn: () => api.get<CommunitySkill[]>(`/skills/community${qs ? `?${qs}` : ""}`),
  });
}
