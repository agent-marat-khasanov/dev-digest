"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, IconBtn, ProgressBar } from "@devdigest/ui";
import type { Convention } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { confidenceColor, confidencePct } from "../../helpers";
import { s } from "./styles";

interface ConventionCardProps {
  convention: Convention;
  repoFullName: string;
  branch: string;
  onAccept: () => void;
  onReject: () => void;
  onSaveRule: (rule: string) => void;
}

/**
 * One extracted convention: inline-editable rule, evidence (clickable file:line
 * → GitHub), a confidence bar, and accept/reject. Rejected cards render dimmed.
 */
export function ConventionCard({
  convention,
  repoFullName,
  branch,
  onAccept,
  onReject,
  onSaveRule,
}: ConventionCardProps) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(convention.rule);

  const accepted = convention.status === "accepted";
  const rejected = convention.status === "rejected";
  const pct = confidencePct(convention.confidence);
  const evidence = convention.evidence;
  const lineNum = evidence ? Number.parseInt(evidence.line, 10) : NaN;
  const fileUrl =
    evidence && repoFullName
      ? githubBlobUrl(repoFullName, branch, evidence.file, Number.isFinite(lineNum) ? lineNum : undefined)
      : null;

  const commitEdit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next.length > 0 && next !== convention.rule) onSaveRule(next);
    else setDraft(convention.rule);
  };

  const copyEvidence = () => {
    if (evidence) void navigator.clipboard?.writeText(`${evidence.file}:${evidence.line}`);
  };

  return (
    <div style={{ ...s.card, ...(rejected ? s.dimmed : {}) }}>
      <div style={s.main}>
        <div style={s.topRow}>
          {convention.category && (
            <Badge color="var(--accent)" bg="var(--accent-bg)" mono>
              {convention.category}
            </Badge>
          )}
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") {
                  setDraft(convention.rule);
                  setEditing(false);
                }
              }}
              style={s.ruleInput}
              aria-label={t("card.editRule")}
            />
          ) : (
            <span
              style={s.rule}
              role="button"
              tabIndex={0}
              title={t("card.editRule")}
              onClick={() => setEditing(true)}
              onKeyDown={(e) => e.key === "Enter" && setEditing(true)}
            >
              {convention.rule}
            </span>
          )}
        </div>

        {evidence && (
          <div style={s.evidence}>
            <div style={s.evidenceHead}>
              {fileUrl ? (
                <a href={fileUrl} target="_blank" rel="noreferrer" className="mono" style={s.evidencePath}>
                  {evidence.file}:{evidence.line}
                </a>
              ) : (
                <span className="mono" style={s.evidencePath}>
                  {evidence.file}:{evidence.line}
                </span>
              )}
              <IconBtn icon="Copy" label={t("card.copy")} size={24} onClick={copyEvidence} />
            </div>
            <pre className="mono" style={s.code}>
              {evidence.code}
            </pre>
          </div>
        )}

        <div style={s.confidenceRow}>
          <div style={s.confidenceBar}>
            <ProgressBar value={pct} color={confidenceColor(pct)} />
          </div>
          <span style={s.confidenceLabel} className="mono">
            {t("card.confidence")} {pct}%
          </span>
        </div>
      </div>

      <div style={s.actions}>
        <Button
          kind={accepted ? "primary" : "ghost"}
          size="sm"
          icon="Check"
          onClick={onAccept}
        >
          {accepted ? t("card.accepted") : t("card.accept")}
        </Button>
        <Button
          kind={rejected ? "danger" : "ghost"}
          size="sm"
          icon="X"
          onClick={onReject}
        >
          {rejected ? t("card.rejected") : t("card.reject")}
        </Button>
      </div>
    </div>
  );
}
