"use client";

import React from "react";
import type { SmartDiff, ReviewRecord, PrFile } from "@devdigest/shared";
import { SplitBanner } from "../SplitBanner";
import { SmartDiffGroup } from "../SmartDiffGroup";

interface SmartDiffViewerProps {
  smartDiff: SmartDiff;
  files: PrFile[];
  reviews?: ReviewRecord[];
  /** Deep-link a finding badge to the Findings tab (parent owns navigation). */
  onOpenFinding: (findingId: string) => void;
}

export function SmartDiffViewer({ smartDiff, files, reviews, onOpenFinding }: SmartDiffViewerProps) {
  return (
    <div>
      <SplitBanner splitSuggestion={smartDiff.split_suggestion} />
      {smartDiff.groups.map((group) => (
        <SmartDiffGroup
          key={group.role}
          group={group}
          prFiles={files}
          reviews={reviews}
          onOpenFinding={onOpenFinding}
        />
      ))}
    </div>
  );
}
