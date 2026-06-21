"use client";

import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { Icon } from "@devdigest/ui";

const s = {
  wrap: {
    padding: "60px 32px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  icon: {
    color: "var(--text-muted)",
    marginBottom: 14,
  } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  subtitle: { fontSize: 14, marginTop: 8, maxWidth: 480 } satisfies CSSProperties,
  comingSoon: {
    marginTop: 16,
    fontSize: 12,
    color: "var(--accent)",
    background: "var(--accent-bg)",
    padding: "4px 10px",
    borderRadius: 999,
  } satisfies CSSProperties,
} as const;

/** Placeholder pane — the eval runner ships in a future lesson. */
export function EvalsTab() {
  const t = useTranslations("skills.lab.evals");
  return (
    <div style={s.wrap}>
      <Icon.FlaskConical size={42} style={s.icon} />
      <h2 style={s.title}>{t("title")}</h2>
      <p style={s.subtitle}>{t("subtitle")}</p>
      <span style={s.comingSoon}>{t("comingSoon")}</span>
    </div>
  );
}
