"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { TYPE_COLOR } from "@/app/skills/_components/SkillCard/constants";
import { s } from "../../styles";

/** Popover listing unbound workspace skills; click adds one to the agent. */
export function AddSkillPopover({
  candidates,
  onAdd,
  onClose,
}: {
  candidates: Skill[];
  onAdd: (skill: Skill) => void;
  onClose: () => void;
}) {
  const t = useTranslations("skills.lab");
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [onClose]);

  return (
    <div ref={ref} style={s.popover}>
      {candidates.length === 0 ? (
        <div style={s.popoverEmpty}>{t("agentTab.noUnbound")}</div>
      ) : (
        candidates.map((sk) => (
          <button
            key={sk.id}
            type="button"
            style={s.popoverItem}
            onClick={() => {
              onAdd(sk);
              onClose();
            }}
          >
            <Icon.Plus size={14} style={{ color: "var(--text-muted)" }} />
            <span style={s.popoverItemName}>{sk.name}</span>
            <span className="mono" style={s.typeChip(TYPE_COLOR[sk.type])}>
              {sk.type}
            </span>
          </button>
        ))
      )}
    </div>
  );
}
