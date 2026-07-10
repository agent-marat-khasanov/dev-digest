/* hooks/repo-file.ts — TanStack Query hook: raw source of a single repo file,
   for the in-app "open caller at line" viewer on the Blast tab.
   GET /repos/:id/file?path=... → RepoFileContent. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { RepoFileContent } from "@devdigest/shared";

export function useRepoFile(
  repoId: string | null | undefined,
  path: string | null | undefined,
) {
  return useQuery({
    queryKey: ["repo-file", repoId, path],
    queryFn: () =>
      api.get<RepoFileContent>(`/repos/${repoId}/file?path=${encodeURIComponent(path!)}`),
    enabled: !!repoId && !!path,
  });
}
