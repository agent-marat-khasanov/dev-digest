"use client";

import React from "react";
import type { SmartDiff, ReviewRecord, PrFile } from "@devdigest/shared";
import { SplitBanner } from "../SplitBanner";
import { SmartDiffGroup } from "../SmartDiffGroup";
import type { ScrollTarget } from "../SmartFileCard";

interface SmartDiffViewerProps {
  smartDiff: SmartDiff;
  files: PrFile[];
  reviews?: ReviewRecord[];
}

export function SmartDiffViewer({ smartDiff, files, reviews }: SmartDiffViewerProps) {
  const [scrollTarget, setScrollTarget] = React.useState<ScrollTarget | null>(null);

  function handleJump(path: string, line: number) {
    setScrollTarget({ path, line, nonce: Date.now() });
  }

  return (
    <div>
      <SplitBanner splitSuggestion={smartDiff.split_suggestion} />
      {smartDiff.groups.map((group) => (
        <SmartDiffGroup
          key={group.role}
          group={group}
          prFiles={files}
          reviews={reviews}
          scrollTarget={scrollTarget}
          onJump={handleJump}
        />
      ))}
    </div>
  );
}
