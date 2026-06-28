"use client";

import React from "react";
import { Badge } from "@devdigest/ui";
import type { SmartDiffFile, ReviewRecord } from "@devdigest/shared";
import { findingsByLine, highestSeverity } from "../helpers";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "../constants";

interface FindingsBadgeProps {
  file: SmartDiffFile;
  reviews?: ReviewRecord[];
  onOpenFinding: (findingId: string) => void;
}

export function FindingsBadge({ file, reviews, onOpenFinding }: FindingsBadgeProps) {
  const count = file.finding_lines.length;
  if (count === 0) return null;

  const byLine = reviews ? findingsByLine(reviews, file.path) : new Map();
  const top = highestSeverity([...byLine.values()]);
  const color = top ? SEV_COLOR[top] ?? SEV_COLOR_FALLBACK : SEV_COLOR_FALLBACK;

  // The first finding for this file in the latest review — the badge deep-links
  // to it (finding_lines is built from exactly these findings, server-side).
  const findingId = reviews?.[0]?.findings.find((f) => f.file === file.path)?.id;
  if (!findingId) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpenFinding(findingId);
      }}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "inline-flex",
      }}
      aria-label={`${count} finding${count !== 1 ? "s" : ""} — open in Findings`}
    >
      <Badge color={color}>
        {count} finding{count !== 1 ? "s" : ""}
      </Badge>
    </button>
  );
}
