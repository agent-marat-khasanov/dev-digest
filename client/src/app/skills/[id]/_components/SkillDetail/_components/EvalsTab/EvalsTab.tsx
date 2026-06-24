/* EvalsTab — eval cases for a skill: X/Y passing, run all / per case, delete. */
"use client";

import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import {
  useDeleteSkillEval,
  useRunAllSkillEvals,
  useRunSkillEval,
  useSkillEvals,
} from "@/lib/hooks/evals";
import { useToast } from "@/lib/toast";
import { EvalCaseRow } from "./_components/EvalCaseRow";
import { s } from "./styles";

export function EvalsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills.lab.evals");
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useSkillEvals(skill.id);
  const runOne = useRunSkillEval(skill.id);
  const runAll = useRunAllSkillEvals(skill.id);
  const del = useDeleteSkillEval(skill.id);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={28} width={260} />
        <div style={{ ...s.list, marginTop: 16 }}>
          <Skeleton height={58} />
          <Skeleton height={58} />
          <Skeleton height={58} />
        </div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div style={s.wrap}>
        <ErrorState body={t("loadError")} onRetry={() => refetch()} />
      </div>
    );
  }

  const passed = data.filter((c) => c.last_run?.pass === true).length;
  const comingSoon = () => toast.info(t("comingSoon"));

  return (
    <div style={s.wrap}>
      <div style={s.headerRow}>
        <h2 style={s.heading}>{t("casesHeading")}</h2>
        {data.length > 0 && (
          <Badge color="var(--warn)" bg="var(--warn-bg)">
            {t("passing", { passed, total: data.length })}
          </Badge>
        )}
        <div style={s.headerActions}>
          <Button
            kind="secondary"
            size="sm"
            icon="Play"
            loading={runAll.isPending}
            disabled={runAll.isPending || data.length === 0}
            onClick={() => runAll.mutate()}
          >
            {runAll.isPending ? t("running") : t("runAll")}
          </Button>
          <Button kind="primary" size="sm" icon="Plus" onClick={comingSoon}>
            {t("newCase")}
          </Button>
        </div>
      </div>

      {data.length === 0 ? (
        <div style={s.empty}>
          <Icon.FlaskConical size={40} style={s.emptyIcon} />
          <h3 style={s.emptyTitle}>{t("emptyTitle")}</h3>
          <p style={s.emptyBody}>{t("emptyBody")}</p>
        </div>
      ) : (
        <div style={s.list}>
          {data.map((c) => (
            <EvalCaseRow
              key={c.id}
              summary={c}
              isRunning={runAll.isPending || (runOne.isPending && runOne.variables === c.id)}
              isDeleting={del.isPending && del.variables === c.id}
              onRun={() => runOne.mutate(c.id)}
              onEdit={comingSoon}
              onDelete={() => {
                if (window.confirm(t("deleteConfirm", { name: c.name }))) del.mutate(c.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
