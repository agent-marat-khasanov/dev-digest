"use client";

import React from "react";
import { Card, SectionLabel, Badge, Button, Skeleton, EmptyState } from "@devdigest/ui";
import { useIntent, useRecalculateIntent } from "@/lib/hooks/intent";
import { notify } from "@/lib/toast";
import { severityChipColors } from "./helpers";
import { s } from "./styles";

interface IntentPanelProps {
  prId: string;
}

export function IntentPanel({ prId }: IntentPanelProps) {
  const { data, isLoading, isError } = useIntent(prId);
  const recalculate = useRecalculateIntent(prId);

  const handleRecalculate = () =>
    recalculate.mutate(undefined, {
      onError: (err) =>
        notify.error(err instanceof Error ? err.message : "Couldn't recalculate intent."),
    });

  if (isLoading) {
    return (
      <Card style={s.card}>
        <SectionLabel icon="Lightbulb">Intent</SectionLabel>
        <div style={s.skeletonStack}>
          <Skeleton height={14} width="80%" />
          <Skeleton height={14} width="60%" />
          <Skeleton height={14} width="40%" />
        </div>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card style={s.card}>
        <EmptyState icon="AlertTriangle" title="Intent unavailable" body="Could not load intent analysis for this PR." />
      </Card>
    );
  }

  return (
    <Card style={s.card}>
      <SectionLabel
        icon="Lightbulb"
        right={
          <Button
            kind="ghost"
            size="sm"
            icon="RefreshCw"
            loading={recalculate.isPending}
            onClick={handleRecalculate}
          >
            Recalculate
          </Button>
        }
      >
        Intent
      </SectionLabel>

      <p style={s.intentQuote}>{data.intent}</p>

      <div style={s.scopeRow}>
        {data.in_scope.length > 0 && (
          <div>
            <div style={s.scopeHeading}>In scope</div>
            <ul style={s.scopeList}>
              {data.in_scope.map((item, i) => (
                <li key={i} style={s.scopeItem}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        {data.out_of_scope.length > 0 && (
          <div>
            <div style={s.scopeHeading}>Out of scope</div>
            <ul style={s.scopeList}>
              {data.out_of_scope.map((item, i) => (
                <li key={i} style={s.scopeItem}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {data.risks.length > 0 && (
        <div>
          <div style={s.scopeHeading}>Risk areas</div>
          <div style={s.riskRow}>
            {data.risks.map((risk, i) => {
              const colors = severityChipColors(risk.severity);
              return (
                <Badge key={i} color={colors.color} bg={colors.bg}>
                  {risk.title}
                </Badge>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
