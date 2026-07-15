"use client";

import React from "react";
import { Card, SectionLabel, Badge, Skeleton, EmptyState } from "@devdigest/ui";
import { useBlast } from "@/lib/hooks/blast";
import { useRepoIntelStatus } from "@/lib/hooks/repo-intel";
import { RepoFileViewer } from "@/components/repo-file-viewer";
import { SymbolNode } from "./_components/SymbolNode";

interface BlastPanelProps {
  prId: string | null;
  repoId: string;
}

/** The caller (file:line) currently open in the in-app viewer, or null. */
export interface ViewerTarget {
  path: string;
  line: number;
}

/**
 * OverviewTab places this panel in a cell sized to the Intent panel's height.
 * Filling that cell (top/left/right:0) keeps the cell's intrinsic height at 0 so
 * the grid row is driven solely by Intent; `maxHeight: 100%` caps the panel at
 * that height and scrolls vertically when the impact map is taller.
 */
const cardStyle: React.CSSProperties = {
  padding: 20,
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  maxHeight: "100%",
  overflowY: "auto",
};

/**
 * Blast radius panel — PR impact map. Renders levels: changed symbols →
 * downstream callers (file:line) → reachable HTTP endpoints / crons. Clicking a
 * caller opens the file at that line in the in-app RepoFileViewer. Reads the
 * repo-intel index only (no LLM); an incomplete index surfaces as a badge, not
 * a blank.
 */
export function BlastPanel({ prId, repoId }: BlastPanelProps) {
  const { data, isLoading, isError } = useBlast(prId);
  const { data: indexState } = useRepoIntelStatus(repoId);
  const [viewer, setViewer] = React.useState<ViewerTarget | null>(null);

  const openCaller = React.useCallback(
    (path: string, line: number) => setViewer({ path, line }),
    [],
  );

  if (isLoading) {
    return (
      <Card style={cardStyle}>
        <SectionLabel icon="Target">Blast radius</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          <Skeleton height={14} width="70%" />
          <Skeleton height={14} width="50%" />
          <Skeleton height={14} width="40%" />
        </div>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card style={cardStyle}>
        <EmptyState
          icon="AlertTriangle"
          title="Blast radius unavailable"
          body="Could not load the impact map for this PR."
        />
      </Card>
    );
  }

  const degraded = !!indexState && indexState.status !== "full";
  const callerCount = data.downstream.reduce((n, d) => n + d.callers.length, 0);
  const endpointCount = new Set(data.downstream.flatMap((d) => d.endpoints_affected)).size;
  const cronCount = new Set(data.downstream.flatMap((d) => d.crons_affected)).size;
  const isEmpty = data.changed_symbols.length === 0;

  return (
    <>
      <Card style={cardStyle}>
        <SectionLabel
          icon="Target"
          right={
            degraded ? (
              <Badge icon="AlertTriangle" color="var(--warn)" bg="transparent">
                index {indexState?.status}
              </Badge>
            ) : undefined
          }
        >
          Blast radius
        </SectionLabel>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0 16px" }}>
          <Badge icon="Code">{data.changed_symbols.length} symbols</Badge>
          <Badge icon="CornerDownRight">{callerCount} callers</Badge>
          <Badge icon="Globe">{endpointCount} endpoints</Badge>
          <Badge icon="Clock">{cronCount} cron</Badge>
        </div>

        {isEmpty ? (
          <EmptyState
            icon="Boxes"
            title="No impact found"
            body={
              degraded
                ? "The repo-intel index isn't fully built for this repository yet — re-index it to see the impact map."
                : "No indexed symbols were declared in the changed files."
            }
          />
        ) : (
          <div>
            {data.downstream.map((impact) => (
              <SymbolNode
                key={impact.symbol}
                impact={impact}
                changed={data.changed_symbols.find((s) => s.name === impact.symbol)}
                onOpenCaller={openCaller}
              />
            ))}
          </div>
        )}

        <p style={{ marginTop: 14, fontSize: 12.5, color: "var(--text-muted)" }}>{data.summary}</p>
      </Card>

      {viewer && (
        <RepoFileViewer
          repoId={repoId}
          path={viewer.path}
          line={viewer.line}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  );
}
