"use client";

import React from "react";
import { Badge } from "@devdigest/ui";
import type { SmartDiffFile, ReviewRecord } from "@devdigest/shared";
import { findingsByLine, highestSeverity } from "../helpers";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "../constants";

interface FindingsBadgeProps {
  file: SmartDiffFile;
  reviews?: ReviewRecord[];
  onJump: (path: string, line: number) => void;
}

export function FindingsBadge({ file, reviews, onJump }: FindingsBadgeProps) {
  const count = file.finding_lines.length;
  if (count === 0) return null;

  const byLine = reviews ? findingsByLine(reviews, file.path) : new Map();
  const top = highestSeverity([...byLine.values()]);
  const color = top ? SEV_COLOR[top] ?? SEV_COLOR_FALLBACK : SEV_COLOR_FALLBACK;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onJump(file.path, file.finding_lines[0]!);
      }}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "inline-flex",
      }}
      aria-label={`${count} finding${count !== 1 ? "s" : ""} — jump to first`}
    >
      <Badge color={color}>
        {count} finding{count !== 1 ? "s" : ""}
      </Badge>
    </button>
  );
}
