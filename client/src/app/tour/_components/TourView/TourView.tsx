/* /tour — repo-scoped onboarding narrative: architecture, critical paths, how to
   run locally, guided reading path, first tasks. Read-only, model-generated with
   a deterministic skeleton/not_available fallback (NG5: no Share link). */
"use client";

import React from "react";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { useActiveRepo } from "@/lib/repo-context";
import { useTour, useRegenerateTour } from "@/lib/hooks/onboarding";
import { formatCost } from "@/lib/format-cost";
import { SectionCard } from "./_components/SectionCard";
import { FileViewer } from "./_components/FileViewer";
import { reasonLabel, formatGeneratedAt } from "./helpers";
import { s } from "./styles";

export function TourView() {
  const { repoId, activeRepo } = useActiveRepo();
  const repoName = activeRepo?.name ?? "your repo";

  const { data: tour, isLoading, isError, refetch } = useTour(repoId);
  const regenerate = useRegenerateTour(repoId);
  const [openPath, setOpenPath] = React.useState<string | null>(null);

  const generating = isLoading || regenerate.isPending;

  return (
    <AppShell crumb={[{ label: "Skills Lab" }, { label: "Onboarding Tour" }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              Onboarding for <span style={s.accent}>{repoName}</span>
            </h1>
            {tour && tour.mode !== "not_available" && (
              <div style={s.metaRow}>
                <span style={s.metaItem}>{tour.index.files_indexed} files indexed</span>
                <span style={s.metaItem}>
                  Last refreshed {formatGeneratedAt(tour.generated_at)}
                </span>
                {tour.mode === "skeleton" && (
                  <Badge icon="AlertTriangle" color="var(--warn)" bg="transparent">
                    generated without model — {reasonLabel(tour.reason)}
                  </Badge>
                )}
              </div>
            )}
          </div>
          {tour && tour.mode !== "not_available" && (
            <Button
              kind="secondary"
              icon="RefreshCw"
              onClick={() => repoId && regenerate.mutate()}
              disabled={!repoId || generating}
              loading={regenerate.isPending}
            >
              {regenerate.isPending ? "Regenerating…" : "Regenerate"}
            </Button>
          )}
        </div>

        {generating && !tour && (
          <div style={s.loadingList}>
            <Skeleton height={80} />
            <Skeleton height={160} />
            <Skeleton height={160} />
          </div>
        )}

        {!generating && isError && (
          <ErrorState
            title="Onboarding tour isn't available"
            body="We couldn't load the onboarding tour for this repo."
            onRetry={() => refetch()}
          />
        )}

        {!generating && !isError && tour && tour.mode === "not_available" && (
          <EmptyState
            icon="FileText"
            title="Onboarding tour isn't available yet"
            body="This repo hasn't been cloned locally. Sync the repo to generate its onboarding tour."
          />
        )}

        {tour && tour.mode !== "not_available" && (
          <>
            <nav aria-label="On this page" style={s.toc}>
              <div style={s.tocTitle}>On this page</div>
              <div style={s.tocList}>
                {tour.sections.map((section) => (
                  <a key={section.id} href={`#${section.id}`} style={s.tocLink}>
                    {section.title}
                  </a>
                ))}
              </div>
            </nav>

            <div style={s.sections}>
              {tour.sections.map((section) => (
                <SectionCard key={section.id} section={section} onOpenFile={setOpenPath} />
              ))}
            </div>

            {tour.generated && (
              <div style={s.footer}>
                {tour.generated.model && <span>Model: {tour.generated.model}</span>}
                <span>Cost: {formatCost(tour.generated.cost_usd)}</span>
                {tour.generated.tokens_in != null && tour.generated.tokens_out != null && (
                  <span>
                    Tokens: {tour.generated.tokens_in} in / {tour.generated.tokens_out} out
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {openPath && repoId && (
        <FileViewer repoId={repoId} path={openPath} onClose={() => setOpenPath(null)} />
      )}
    </AppShell>
  );
}
