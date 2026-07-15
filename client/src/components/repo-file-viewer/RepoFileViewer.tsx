"use client";

import React from "react";
import { Icon, Skeleton, EmptyState } from "@devdigest/ui";
import { useRepoFile } from "@/lib/hooks/repo-file";

interface RepoFileViewerProps {
  repoId: string;
  path: string;
  line?: number;
  /** External fallback (e.g. GitHub blob URL at the PR head) shown when the file is not in the clone. */
  githubUrl?: string;
  onClose: () => void;
}

/**
 * Shared in-app repo file viewer: fetches an arbitrary repo file via
 * `useRepoFile` and renders it in a modal. When `line` is given, scrolls to
 * and highlights that line (the Blast tab's "click a caller → jump to the
 * exact line" flow); omitted, it just opens the whole file (tour's Open
 * chips, the brief's file-reference chips). Modal: closes on Escape or
 * backdrop click.
 */
export function RepoFileViewer({ repoId, path, line, githubUrl, onClose }: RepoFileViewerProps) {
  const { data, isLoading, isError } = useRepoFile(repoId, path);
  const lineRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Once content is in the DOM, center the target line.
  React.useEffect(() => {
    if (data && line != null) lineRef.current?.scrollIntoView({ block: "center" });
  }, [data, line]);

  const lines = data ? data.content.split("\n") : [];
  const label = line != null ? `${path}:${line}` : path;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "stretch",
        zIndex: 50,
        padding: "5vh 4vw",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          width: "min(920px, 100%)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Icon.Code size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <span
            className="mono"
            style={{
              fontSize: 13,
              color: "var(--text-primary)",
              overflowWrap: "anywhere",
              minWidth: 0,
            }}
          >
            {label}
          </span>
          <button
            aria-label="Close file viewer"
            onClick={onClose}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              display: "flex",
            }}
          >
            <Icon.XCircle size={18} />
          </button>
        </div>

        <div style={{ overflow: "auto", flex: 1, maxHeight: "80vh" }}>
          {isLoading && (
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <Skeleton height={12} width="90%" />
              <Skeleton height={12} width="70%" />
              <Skeleton height={12} width="80%" />
            </div>
          )}

          {isError && (
            <EmptyState
              icon="AlertTriangle"
              title="Couldn't open file"
              body={
                <span style={{ overflowWrap: "anywhere" }}>
                  <span className="mono">{path}</span> is not available in the repository&apos;s
                  local clone — it may be new in this PR (the clone tracks the default branch).
                  {githubUrl && (
                    <>
                      {" "}
                      <a
                        href={githubUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "var(--accent)", whiteSpace: "nowrap" }}
                      >
                        View on GitHub ↗
                      </a>
                    </>
                  )}
                </span>
              }
            />
          )}

          {data && (
            <pre className="mono" style={{ margin: 0, padding: "8px 0", fontSize: 12.5 }}>
              {lines.map((text, i) => {
                const n = i + 1;
                const isTarget = n === line;
                return (
                  <div
                    key={n}
                    ref={isTarget ? lineRef : undefined}
                    style={{
                      display: "flex",
                      background: isTarget ? "var(--bg-hover)" : "transparent",
                      padding: "0 14px",
                    }}
                  >
                    <span
                      className="tnum"
                      style={{
                        width: 48,
                        textAlign: "right",
                        paddingRight: 14,
                        color: "var(--text-muted)",
                        userSelect: "none",
                        flexShrink: 0,
                      }}
                    >
                      {n}
                    </span>
                    <span
                      style={{
                        whiteSpace: "pre",
                        color: isTarget ? "var(--text-primary)" : "var(--text-secondary)",
                      }}
                    >
                      {text || " "}
                    </span>
                  </div>
                );
              })}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
