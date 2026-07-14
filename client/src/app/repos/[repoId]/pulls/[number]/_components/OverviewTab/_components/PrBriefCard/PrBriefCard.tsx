"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import { Card, SectionLabel, Badge, Button, Skeleton, EmptyState } from "@devdigest/ui";
import { useBrief, useRegenerateBrief } from "@/lib/hooks/brief";
import { notify } from "@/lib/toast";
import { formatCost } from "@/lib/format-cost";
import { RepoFileViewer } from "@/components/repo-file-viewer";
import { riskLevelColors, isEndpointRef } from "./helpers";
import { s } from "./styles";

/**
 * Model-authored text is untrusted (AC-18): neutralize markdown links by
 * rendering their children as a plain span (no href). No `rehype-raw` is
 * installed, so raw HTML is already inert. Mirrors the tour SectionCard
 * precedent.
 */
const MARKDOWN_COMPONENTS = {
  a: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
};

interface PrBriefCardProps {
  prId: string | null;
  repoId: string;
}

export function PrBriefCard({ prId, repoId }: PrBriefCardProps) {
  const { data, isLoading, isError, isFetching, refetch } = useBrief(prId);
  const regenerate = useRegenerateBrief(prId);
  const [viewerPath, setViewerPath] = React.useState<string | null>(null);

  const handleRegenerate = () =>
    regenerate.mutate(undefined, {
      onError: (err) =>
        notify.error(err instanceof Error ? err.message : "Couldn't regenerate the brief."),
    });

  const handleRetry = () => refetch();

  if (isLoading) {
    return (
      <Card style={s.card}>
        <SectionLabel icon="Shield">PR brief</SectionLabel>
        <div style={s.skeletonStack}>
          <Skeleton height={14} width="90%" />
          <Skeleton height={14} width="70%" />
          <Skeleton height={14} width="50%" />
        </div>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card style={s.card}>
        <SectionLabel icon="Shield">PR brief</SectionLabel>
        <EmptyState
          icon="AlertTriangle"
          title="Brief unavailable"
          body="Could not generate a why + risk brief for this PR."
          cta="Retry"
          onCta={handleRetry}
          ctaLoading={isFetching}
        />
      </Card>
    );
  }

  const riskColors = riskLevelColors(data.risk_level);

  return (
    <>
      <Card style={s.card}>
        <SectionLabel
          icon="Shield"
          right={
            <Button
              kind="ghost"
              size="sm"
              icon="RefreshCw"
              loading={regenerate.isPending}
              onClick={handleRegenerate}
            >
              Regenerate
            </Button>
          }
        >
          PR brief
        </SectionLabel>

        <div style={s.riskRow}>
          <Badge color={riskColors.color} bg={riskColors.bg}>
            {data.risk_level} risk
          </Badge>
        </div>

        <div style={s.narrative}>
          <ReactMarkdown components={MARKDOWN_COMPONENTS}>{data.what}</ReactMarkdown>
          <ReactMarkdown components={MARKDOWN_COMPONENTS}>{data.why}</ReactMarkdown>
        </div>

        {data.risks.length > 0 && (
          <div>
            <div style={s.sectionHeading}>Risks</div>
            <div style={s.risksList}>
              {data.risks.map((risk, i) => {
                const colors = riskLevelColors(risk.severity);
                return (
                  <div key={i} style={s.riskCard}>
                    <div style={s.riskHeader}>
                      <Badge color={colors.color} bg={colors.bg}>
                        {risk.severity}
                      </Badge>
                      <span style={s.riskTitle}>{risk.title}</span>
                    </div>
                    <div style={s.riskExplanation}>
                      <ReactMarkdown components={MARKDOWN_COMPONENTS}>
                        {risk.explanation}
                      </ReactMarkdown>
                    </div>
                    {risk.file_refs.length > 0 && (
                      <div style={s.refRow}>
                        {risk.file_refs.map((ref, j) =>
                          isEndpointRef(ref) ? (
                            <Badge key={j} mono style={s.wrapBadge}>
                              {ref}
                            </Badge>
                          ) : (
                            <Badge
                              key={j}
                              icon="FileText"
                              bg="transparent"
                              color="var(--accent)"
                              style={s.wrapBadge}
                            >
                              <button
                                type="button"
                                onClick={() => setViewerPath(ref)}
                                style={s.fileLinkButton}
                              >
                                {ref}
                              </button>
                            </Badge>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {data.review_focus.length > 0 && (
          <div>
            <div style={s.sectionHeading}>Review focus</div>
            <ol style={s.focusList}>
              {data.review_focus.map((item, i) => (
                <li key={i} style={s.focusItem}>
                  <Badge icon="FileText" bg="transparent" color="var(--accent)" style={s.wrapBadge}>
                    <button
                      type="button"
                      onClick={() => setViewerPath(item.path)}
                      style={s.fileLinkButton}
                    >
                      {item.path}
                    </button>
                  </Badge>
                  <span style={s.focusReason}>{item.reason}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {data.generated && (
          <div style={s.footer}>
            {data.generated.model && <span>{data.generated.model}</span>}
            <span>{formatCost(data.generated.cost_usd)}</span>
          </div>
        )}
      </Card>

      {viewerPath && (
        <RepoFileViewer repoId={repoId} path={viewerPath} onClose={() => setViewerPath(null)} />
      )}
    </>
  );
}
