"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentPanel } from "./_components/IntentPanel";
import { BlastPanel } from "./_components/BlastPanel";
import { PrBriefCard } from "./_components/PrBriefCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
  repoId: string;
}

export function OverviewTab({ prId, prBody, repoId }: OverviewTabProps) {
  return (
    <>
      {prId && <PrBriefCard prId={prId} repoId={repoId} />}

      {prId && (
        <div style={s.grid}>
          <IntentPanel prId={prId} />
          <div style={s.blastCell}>
            <BlastPanel prId={prId} repoId={repoId} />
          </div>
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
