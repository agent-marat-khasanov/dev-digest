"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Drawer, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { CommunitySkill } from "@devdigest/shared";
import { useCommunitySkills, useCreateSkill } from "@/lib/hooks/skills";
import { FILTER_LANGS, s } from "./styles";

/**
 * Right-side drawer that lists the community catalogue. Each entry carries a
 * pre-baked body, so Import is one POST + close.
 */
export function CommunitySkillsDrawer({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills.lab");
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [lang, setLang] = React.useState<string>("");
  const filter = { ...(q ? { q } : {}), ...(lang ? { lang } : {}) };
  const { data: skills, isLoading, isError, refetch } = useCommunitySkills(filter);
  const create = useCreateSkill();

  const onImport = async (sk: CommunitySkill) => {
    const created = await create.mutateAsync({
      name: sk.name,
      description: sk.desc,
      type: sk.type,
      body: sk.body,
      source: "community",
    });
    onClose();
    router.push(`/skills/${created.id}?tab=preview`);
  };

  return (
    <Drawer width={520} title={t("communityDrawer.title")} subtitle={t("communityDrawer.subtitle")} onClose={onClose}>
      <div style={s.body}>
        <div style={s.searchRow}>
          <Icon.Search size={13} style={s.searchIcon} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("communityDrawer.searchPlaceholder")}
            style={s.searchInput}
          />
        </div>
        <div style={s.filterRow}>
          {FILTER_LANGS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              style={s.filterChip(lang === opt.value)}
              onClick={() => setLang(opt.value)}
            >
              {opt.labelKey ? t(opt.labelKey) : opt.value}
            </button>
          ))}
        </div>

        {isLoading && (
          <div style={s.list}>
            <Skeleton height={80} />
            <Skeleton height={80} />
            <Skeleton height={80} />
          </div>
        )}
        {isError && <ErrorState body={t("communityDrawer.loadError")} onRetry={() => refetch()} />}
        {skills && skills.length === 0 && <div style={s.empty}>{t("communityDrawer.empty")}</div>}
        {skills && skills.length > 0 && (
          <div style={s.list}>
            {skills.map((sk) => (
              <div key={sk.name} style={s.card}>
                <div style={s.cardHead}>
                  <span style={s.cardName}>{sk.name}</span>
                  <span style={s.cardStars}>
                    <Icon.Star size={11} />
                    {sk.stars.toLocaleString()}
                  </span>
                </div>
                <div style={s.cardDesc}>{sk.desc}</div>
                <div style={s.cardMeta}>
                  <span style={s.repo}>{sk.repo}</span>
                  <span style={s.langChip}>{sk.lang}</span>
                  <Button
                    kind="primary"
                    size="sm"
                    icon="Plus"
                    onClick={() => void onImport(sk)}
                    disabled={create.isPending}
                  >
                    {create.isPending ? t("communityDrawer.importing") : t("communityDrawer.import")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}
