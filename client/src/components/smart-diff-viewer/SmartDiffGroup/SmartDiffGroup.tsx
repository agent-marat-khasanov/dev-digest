"use client";

import React from "react";
import { Badge, Icon } from "@devdigest/ui";
import type { SmartDiffGroup as SmartDiffGroupType, ReviewRecord, PrFile } from "@devdigest/shared";
import { SmartFileCard } from "../SmartFileCard";
import { ROLE_LABEL, ROLE_CAPTION } from "../constants";

interface SmartDiffGroupProps {
  group: SmartDiffGroupType;
  prFiles: PrFile[];
  reviews?: ReviewRecord[];
  onOpenFinding: (findingId: string) => void;
}

export function SmartDiffGroup({
  group,
  prFiles,
  reviews,
  onOpenFinding,
}: SmartDiffGroupProps) {
  const [open, setOpen] = React.useState(group.role !== "boilerplate");

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => e.key === "Enter" && setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 4px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <Icon.ChevronRight
          size={14}
          style={{
            color: "var(--text-muted)",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform .12s",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}
        >
          {ROLE_LABEL[group.role]}
        </span>
        <Badge>{group.files.length} files</Badge>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {ROLE_CAPTION[group.role]}
        </span>
      </div>

      {open && (
        <div>
          {group.files.map((file) => {
            const prFile = prFiles.find((f) => f.path === file.path);
            return (
              <SmartFileCard
                key={file.path}
                file={file}
                prFile={prFile}
                reviews={reviews}
                onOpenFinding={onOpenFinding}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
