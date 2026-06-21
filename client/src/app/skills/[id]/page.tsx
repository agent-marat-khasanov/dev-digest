/* /skills/:id — Skill detail. Left rail = skill cards, right pane = SkillDetail
   (Config / Preview / Evals / Stats / Versions). Tab state lives in ?tab=. */
"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Dropdown, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api";
import { useSkill, useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SkillCard } from "../_components/SkillCard";
import { SkillDetail } from "./_components/SkillDetail";
import { VALID_TAB_KEYS } from "./_components/SkillDetail/constants";

export default function SkillEditorPage() {
  const t = useTranslations("skills.lab");
  const toast = useToast();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const { id } = params;

  const { data: skills } = useSkills();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const update = useUpdateSkill();

  const requested = search.get("tab") ?? "";
  const tab = VALID_TAB_KEYS.includes(requested) ? requested : "config";
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: t("list.breadcrumbLab") },
    { label: t("list.breadcrumb"), href: "/skills" },
    { label: skill?.name ?? t("editor.title") },
  ];

  if (isError || (!isLoading && !skill)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("editor.loadErrorTitle")}
          body={error instanceof ApiError ? error.message : t("editor.loadErrorBody")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={{ display: "flex", height: "calc(100vh - 52px)" }}>
        {/* left: skills list */}
        <div
          style={{
            width: 320,
            flexShrink: 0,
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-surface)",
          }}
        >
          <div style={{ padding: "16px 16px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <h1 style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>{t("list.title")}</h1>
              <Dropdown
                width={220}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus">
                    {t("list.addSkill")}
                  </Button>
                }
                items={[
                  { label: t("list.createFromScratch"), icon: "Edit", onClick: () => router.push("/skills") },
                  { label: t("list.importFromFile"), icon: "Upload", onClick: () => router.push("/skills") },
                  { label: t("communityDrawer.fromMenu"), icon: "Globe", onClick: () => router.push("/skills") },
                ]}
              />
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "0 12px 12px" }}>
            {(skills ?? []).map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === id}
                onClick={() => router.push(`/skills/${sk.id}?tab=${tab}`)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        </div>

        {/* detail */}
        {isLoading || !skill ? (
          <div style={{ flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 0", flexShrink: 0 }}>
              <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
              <h1 style={{ fontSize: 18, fontWeight: 700 }}>{skill.name}</h1>
              <Badge color="var(--text-secondary)" mono>
                {skill.type}
              </Badge>
              <Badge color="var(--text-muted)" mono>
                v{skill.version}
              </Badge>
              {!skill.enabled && <Badge color="var(--text-muted)">disabled</Badge>}
              <div style={{ marginLeft: "auto" }}>
                <Button
                  kind="secondary"
                  size="sm"
                  icon="Play"
                  onClick={() => toast.info(t("editor.evalsToast"))}
                >
                  {t("editor.runOnEvals")}
                </Button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <SkillDetail skill={skill} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
