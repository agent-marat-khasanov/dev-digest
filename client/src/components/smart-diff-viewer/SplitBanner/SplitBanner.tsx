"use client";

import React from "react";
import { Card } from "@devdigest/ui";
import type { SmartDiff } from "@devdigest/shared";

interface SplitBannerProps {
  splitSuggestion: SmartDiff["split_suggestion"];
}

export function SplitBanner({ splitSuggestion }: SplitBannerProps) {
  if (!splitSuggestion.too_big) return null;

  return (
    <Card
      style={{
        padding: "14px 16px",
        marginBottom: 16,
        borderLeft: "3px solid var(--warn)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          PR is large — suggested splits
        </span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {splitSuggestion.total_lines.toLocaleString()} total changed lines
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {splitSuggestion.proposed_splits.map((split, i) => (
          <div key={i} style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 500 }}>{split.name}</span>
            <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
              {split.files.length} file{split.files.length !== 1 ? "s" : ""}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
