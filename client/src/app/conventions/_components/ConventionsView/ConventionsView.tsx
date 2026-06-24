/* /conventions — extract house-rules from the active repo, accept/reject them,
   and bake the accepted ones into a Skill. Mirrors SkillsListView. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton, Toggle } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/repo-context";
import {
  useConventions,
  useExtractConventions,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import type { Convention, ConventionStatus } from "@devdigest/shared";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { lastScanAt, timeAgo } from "./helpers";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const { repoId, activeRepo } = useActiveRepo();
  const repoName = activeRepo?.name ?? t("page.repoFallback");

  const { data: conventions, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId ?? "");
  const update = useUpdateConvention(repoId ?? "");

  const [showRejected, setShowRejected] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  const all = conventions ?? [];
  const accepted = all.filter((c) => c.status === "accepted");
  const visible = showRejected ? all : all.filter((c) => c.status !== "rejected");
  const scan = lastScanAt(all);

  const setStatus = (c: Convention, status: ConventionStatus) =>
    update.mutate({ id: c.id, patch: { status } });

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }]}>
      {creating && repoId && (
        <CreateSkillModal
          repoId={repoId}
          repoName={repoName}
          accepted={accepted}
          onClose={() => setCreating(false)}
        />
      )}

      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span style={s.accent}>{repoName}</span>
            </h1>
            <p style={s.subtitle}>
              {scan
                ? t("page.scanSubtitle", { count: all.length, when: timeAgo(scan, Date.now()) })
                : t("page.subtitle")}
            </p>
          </div>
          <Button
            kind="secondary"
            icon="RefreshCw"
            onClick={() => extract.mutate()}
            disabled={!repoId || extract.isPending}
          >
            {extract.isPending ? t("page.scanning") : t("page.rescan")}
          </Button>
        </div>

        {all.length > 0 && (
          <div style={s.actionBar}>
            <div style={s.actionLeft}>
              <Button
                kind="ghost"
                size="sm"
                icon="X"
                onClick={() => accepted.forEach((c) => setStatus(c, "pending"))}
                disabled={accepted.length === 0}
              >
                {t("actions.deselectAll")}
              </Button>
              <span style={s.counter}>
                {t("actions.acceptedCount", { count: accepted.length, total: all.length })}
              </span>
            </div>
            <label style={s.toggleRow}>
              <Toggle on={showRejected} onChange={setShowRejected} />
              {t("actions.showRejected")}
            </label>
            <Button
              kind="primary"
              icon="Sparkles"
              onClick={() => setCreating(true)}
              disabled={accepted.length === 0}
            >
              {t("actions.createSkill")}
            </Button>
          </div>
        )}

        {extract.isError && <ErrorState body={t("page.extractionFailed")} onRetry={() => extract.mutate()} />}

        {isLoading && (
          <div style={s.list}>
            <Skeleton height={140} />
            <Skeleton height={140} />
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && all.length === 0 && (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={extract.isPending ? t("page.scanning") : t("page.empty.cta")}
            onCta={() => repoId && extract.mutate()}
          />
        )}

        {visible.length > 0 && (
          <div style={s.list}>
            {visible.map((c) => (
              <ConventionCard
                key={c.id}
                convention={c}
                repoFullName={activeRepo?.full_name ?? ""}
                branch={activeRepo?.default_branch ?? "main"}
                onAccept={() => setStatus(c, "accepted")}
                onReject={() => setStatus(c, "rejected")}
                onSaveRule={(rule) => update.mutate({ id: c.id, patch: { rule } })}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
