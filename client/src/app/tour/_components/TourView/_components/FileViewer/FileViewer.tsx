"use client";

import React from "react";
import { Icon, Skeleton, EmptyState } from "@devdigest/ui";
import { useRepoFile } from "@/lib/hooks/repo-file";

interface FileViewerProps {
  repoId: string;
  path: string;
  onClose: () => void;
}

/**
 * In-app file viewer for the tour's Open chips (AC-4). Reuses `useRepoFile`
 * like the Blast tab's CodeViewer, but has no line target — the tour only
 * ever links whole files, not call sites. Modal: closes on Escape or
 * backdrop click.
 */
export function FileViewer({ repoId, path, onClose }: FileViewerProps) {
  const { data, isLoading, isError } = useRepoFile(repoId, path);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const lines = data ? data.content.split("\n") : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={path}
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
          <span className="mono" style={{ fontSize: 13, color: "var(--text-primary)" }}>
            {path}
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
              body={`${path} is not available in the repository's local clone.`}
            />
          )}

          {data && (
            <pre className="mono" style={{ margin: 0, padding: "8px 0", fontSize: 12.5 }}>
              {lines.map((text, i) => {
                const n = i + 1;
                return (
                  <div key={n} style={{ display: "flex", padding: "0 14px" }}>
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
                    <span style={{ whiteSpace: "pre", color: "var(--text-secondary)" }}>
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
