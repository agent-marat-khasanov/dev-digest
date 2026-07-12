/* /context — repo-scoped, read-only browser for docs discovered under specs/docs/insights.
   Mirrors ConventionsView: page header + rescan action + list/preview body. No edit mode,
   no upload toolbar, no coverage badge, no index stats (NG1-NG3). */
"use client";

import React from "react";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/repo-context";
import { useContextFiles, useReindexContext } from "@/lib/hooks/context";
import type { ContextDoc } from "@devdigest/shared";
import { DocPreview } from "./_components/DocPreview";
import { DocRow } from "./_components/DocRow";
import { DEFAULT_CONTEXT_ROOTS } from "./constants";
import { sortDocs } from "./helpers";
import { s } from "./styles";

export function ContextView() {
  const { repoId, activeRepo } = useActiveRepo();
  const repoName = activeRepo?.name ?? "your repo";

  const { data, isLoading, isError, refetch } = useContextFiles(repoId);
  const rescan = useReindexContext();

  const docs = sortDocs(data ?? []);
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const selected: ContextDoc | null = docs.find((d) => d.path === selectedPath) ?? null;

  return (
    <AppShell crumb={[{ label: "Skills Lab" }, { label: "Project Context" }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              Project Context <span style={s.accent}>{repoName}</span>
            </h1>
            <p style={s.subtitle}>
              Markdown docs discovered under specs/, docs/, and insights/ in this repo.
            </p>
          </div>
          <Button
            kind="secondary"
            icon="RefreshCw"
            onClick={() => repoId && rescan.mutate(repoId)}
            disabled={!repoId || rescan.isPending}
          >
            {rescan.isPending ? "Rescanning…" : "Rescan"}
          </Button>
        </div>

        {isLoading && (
          <div style={s.loadingList}>
            <Skeleton height={52} />
            <Skeleton height={52} />
            <Skeleton height={52} />
          </div>
        )}

        {isError && (
          <ErrorState
            title="Project Context isn't available"
            body="We couldn't reach this repo's clone. Sync the repo, then rescan."
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && docs.length === 0 && (
          <EmptyState
            icon="FileText"
            title="No docs found"
            body={`We searched ${DEFAULT_CONTEXT_ROOTS.join(", ")} for markdown files and found none. Make sure the repo is synced, then rescan.`}
          />
        )}

        {!isLoading && !isError && docs.length > 0 && (
          <div style={s.body}>
            <div style={s.list}>
              {docs.map((doc) => (
                <DocRow
                  key={doc.path}
                  doc={doc}
                  selected={doc.path === selectedPath}
                  onSelect={() => setSelectedPath(doc.path)}
                />
              ))}
            </div>
            <DocPreview repoId={repoId} doc={selected} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
