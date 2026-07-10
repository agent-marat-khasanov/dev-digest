"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentPanel } from "./_components/IntentPanel";
import { BlastPanel } from "./_components/BlastPanel";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
  repoId: string;
}

export function OverviewTab({ prId, prBody, repoId }: OverviewTabProps) {
  return (
    <>
      {prId && (
        <div style={s.grid}>
          <IntentPanel prId={prId} />
          <BlastPanel prId={prId} repoId={repoId} />
        </div>
      )}

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
