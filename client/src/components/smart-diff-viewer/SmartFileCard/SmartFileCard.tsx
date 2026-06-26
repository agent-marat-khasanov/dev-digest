"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import type { SmartDiffFile, ReviewRecord, PrFile } from "@devdigest/shared";
import { CodeLine } from "@/components/diff-viewer/CodeLine";
import { parsePatch } from "@/components/diff-viewer/helpers";
import { s, chevronFor } from "@/components/diff-viewer/styles";
import { AUTO_EXPAND_MAX_LINES } from "@/components/diff-viewer/constants";
import { FindingsBadge } from "../FindingsBadge";
import { findingsByLine, lineDomId } from "../helpers";
import { SEV_COLOR, SEV_COLOR_FALLBACK, HIGHLIGHT_MS } from "../constants";

const FILE_HEADER_H = 44;

export interface ScrollTarget {
  path: string;
  line: number;
  nonce: number;
}

interface SmartFileCardProps {
  file: SmartDiffFile;
  prFile: PrFile | undefined;
  reviews?: ReviewRecord[];
  scrollTarget: ScrollTarget | null;
  onJump: (path: string, line: number) => void;
}

export function SmartFileCard({
  file,
  prFile,
  reviews,
  scrollTarget,
  onJump,
}: SmartFileCardProps) {
  const lines = React.useMemo(
    () => parsePatch(prFile?.patch),
    [prFile?.patch],
  );

  const markerMap = React.useMemo(
    () => (reviews ? findingsByLine(reviews, file.path) : new Map()),
    [reviews, file.path],
  );

  const [open, setOpen] = React.useState(() => lines.length <= AUTO_EXPAND_MAX_LINES);

  // Scroll-to-line: force open then scroll after render settles.
  React.useEffect(() => {
    if (!scrollTarget || scrollTarget.path !== file.path) return;
    setOpen(true);
    const { line } = scrollTarget;
    const timer = setTimeout(() => {
      const el = document.getElementById(lineDomId(file.path, line));
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("diff-line-highlight");
      setTimeout(() => el.classList.remove("diff-line-highlight"), HIGHLIGHT_MS);
    }, 50);
    return () => clearTimeout(timer);
  // nonce changes on each new jump; path guards whether this card acts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollTarget]);

  return (
    <div style={{ ...s.fileCard, marginBottom: 4 }}>
      <div style={s.fileHeader} onClick={() => setOpen((v) => !v)}>
        <span style={s.filePath}>{file.path}</span>
        <span style={{ ...s.fileStat, display: "flex", gap: 6 }}>
          <span style={s.addText}>+{file.additions}</span>
          <span style={s.delText}>-{file.deletions}</span>
        </span>
        <FindingsBadge file={file} reviews={reviews} onJump={onJump} />
        <Icon.ChevronRight size={14} style={chevronFor(open)} />
      </div>

      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>No diff available</div>
          ) : (
            lines.map((ln, i) => {
              const markSeverity =
                ln.newNo != null ? markerMap.get(ln.newNo) : undefined;
              const domId =
                ln.newNo != null ? lineDomId(file.path, ln.newNo) : undefined;

              return (
                <div
                  key={`${ln.kind}-${ln.oldNo ?? ""}-${ln.newNo ?? ""}-${i}`}
                  id={domId}
                  style={{
                    position: "relative",
                    scrollMarginTop: FILE_HEADER_H,
                  }}
                >
                  {markSeverity && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        left: 4,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background:
                          SEV_COLOR[markSeverity] ?? SEV_COLOR_FALLBACK,
                        zIndex: 1,
                        pointerEvents: "none",
                      }}
                    />
                  )}
                  <CodeLine ln={ln} path={file.path} threads={[]} />
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
