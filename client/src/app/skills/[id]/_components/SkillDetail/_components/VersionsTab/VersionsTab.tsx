"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Icon, Modal, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useToast } from "@/lib/toast";
import {
  useRestoreSkillVersion,
  useSkillVersionDiff,
  useSkillVersions,
} from "@/lib/hooks/skills";
import { diffLineColor, s } from "./styles";

/** Versions tab — list of snapshots with Diff modal + Restore action. */
export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills.lab.versions");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion(skill.id);
  const [diffOf, setDiffOf] = React.useState<number | null>(null);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <h2 style={s.title}>{t("title")}</h2>
        <div style={{ marginTop: 16 }}>
          <Skeleton height={68} />
          <Skeleton height={68} />
        </div>
      </div>
    );
  }
  if (isError || !versions) {
    return (
      <div style={s.wrap}>
        <ErrorState body="Could not load versions." onRetry={() => refetch()} />
      </div>
    );
  }

  const sorted = [...versions].sort((a, b) => b.version - a.version);
  const current = skill.version;

  const onRestore = (v: number) => {
    if (!window.confirm(t("restoreConfirm", { version: v }))) return;
    restore.mutate(v, {
      onSuccess: (data) => toast.success(t("restoreToast", { version: v, current: data.version })),
    });
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.title}>{t("title")}</h2>
        <span style={s.count}>{t("countLabel", { count: versions.length })}</span>
      </div>
      <p style={s.subtitle}>{t("subtitle")}</p>
      <div style={s.list}>
        {sorted.map((v) => {
          const isCurrent = v.version === current;
          return (
            <div key={v.version} style={s.row}>
              <span style={s.versionPill}>v{v.version}</span>
              <div style={s.meta}>
                <span style={s.rowTitle}>
                  {isCurrent ? `Current — body in use` : `Body snapshot v${v.version}`}
                </span>
                <span style={s.rowDate}>{new Date(v.created_at).toLocaleString()}</span>
              </div>
              {isCurrent ? (
                <span style={s.currentBadge}>
                  <Icon.Check size={12} />
                  {t("currentBadge")}
                </span>
              ) : (
                <div style={s.actions}>
                  <Button kind="ghost" size="sm" icon="Eye" onClick={() => setDiffOf(v.version)}>
                    {t("diff")}
                  </Button>
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="History"
                    onClick={() => onRestore(v.version)}
                    disabled={restore.isPending}
                  >
                    {t("restore")}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {diffOf != null && (
        <DiffModal skillId={skill.id} version={diffOf} onClose={() => setDiffOf(null)} />
      )}
    </div>
  );
}

function DiffModal({
  skillId,
  version,
  onClose,
}: {
  skillId: string;
  version: number;
  onClose: () => void;
}) {
  const t = useTranslations("skills.lab.versions");
  const { data, isLoading } = useSkillVersionDiff(skillId, version);
  return (
    <Modal width={900} title={t("diffModalTitle", { version })} onClose={onClose}>
      {isLoading ? (
        <div style={{ padding: 24 }}>
          <Skeleton height={120} />
        </div>
      ) : !data || data.unified.trim().length === 0 ? (
        <div style={s.diffEmpty}>{t("diffEmpty")}</div>
      ) : (
        <pre style={s.diffPre}>
          {data.unified.split("\n").map((line, i) => (
            <span key={i} style={{ color: diffLineColor(line), display: "block" }}>
              {line || " "}
            </span>
          ))}
        </pre>
      )}
    </Modal>
  );
}
