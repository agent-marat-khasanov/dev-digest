"use client";

import React from "react";
import { SectionLabel, Button, Skeleton, EmptyState } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { SmartDiffViewer } from "@/components/smart-diff-viewer";
import { usePrComments, useCreatePrComment, usePrReviews } from "@/lib/hooks/reviews";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

type DiffMode = "smart" | "original";

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const [mode, setMode] = React.useState<DiffMode>("smart");

  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: reviews } = usePrReviews(prId);
  const { data: smartDiff, isLoading: smartLoading, isError: smartError } = useSmartDiff(prId ?? undefined);

  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  const modeToggle = (
    <div style={{ display: "flex", gap: 2 }}>
      <Button
        kind={mode === "smart" ? "primary" : "ghost"}
        size="sm"
        onClick={() => setMode("smart")}
      >
        Smart
      </Button>
      <Button
        kind={mode === "original" ? "primary" : "ghost"}
        size="sm"
        onClick={() => setMode("original")}
      >
        Original
      </Button>
    </div>
  );

  const commentsButton =
    commentCount > 0 && mode === "original" ? (
      <Button
        kind="ghost"
        size="sm"
        icon={showComments ? "EyeOff" : "Eye"}
        onClick={() => setShowComments((v) => !v)}
      >
        {showComments ? "Hide comments" : "Show comments"} ({commentCount})
      </Button>
    ) : undefined;

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {modeToggle}
            {commentsButton}
          </div>
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>

      {mode === "smart" && (
        <>
          {smartLoading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Skeleton height={44} />
              <Skeleton height={44} />
              <Skeleton height={200} />
            </div>
          )}
          {smartError && (
            <EmptyState
              icon="AlertTriangle"
              title="Smart Diff unavailable"
              body="Could not load the smart diff analysis. Switch to Original to view the raw diff."
            />
          )}
          {!smartLoading && !smartError && !smartDiff && (
            <EmptyState
              icon="FileText"
              title="No smart diff yet"
              body="Smart diff is generated when the PR is indexed. Switch to Original to view the raw diff."
            />
          )}
          {!smartLoading && !smartError && smartDiff && (
            <SmartDiffViewer
              smartDiff={smartDiff}
              files={files}
              reviews={reviews ?? []}
            />
          )}
        </>
      )}

      {mode === "original" && <DiffViewer files={files} commenting={commenting} />}
    </section>
  );
}
