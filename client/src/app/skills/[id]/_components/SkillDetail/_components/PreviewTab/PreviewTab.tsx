"use client";

import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";

const s = {
  wrap: { padding: "24px 28px 32px", maxWidth: 880 } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", marginTop: 4, marginBottom: 20 } satisfies CSSProperties,
  bodyWrap: {
    padding: 20,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    minHeight: 200,
  } satisfies CSSProperties,
} as const;

/** Preview tab — renders the skill body as Markdown, mirroring the agent's view. */
export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills.lab.preview2");
  return (
    <div style={s.wrap}>
      <h2 style={s.title}>{t("title")}</h2>
      <p style={s.subtitle}>{t("subtitle")}</p>
      <div style={s.bodyWrap}>
        <Markdown>{skill.body || "—"}</Markdown>
      </div>
    </div>
  );
}
