"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox, Icon } from "@devdigest/ui";
import type { ContextDoc } from "@devdigest/shared";
import { FOLDER_BADGE_COLOR } from "../../constants";
import { s } from "../../styles";

export function SortableRow({
  path,
  doc,
  attached,
  onToggle,
  onPreview,
}: {
  path: string;
  doc: ContextDoc | null;
  attached: boolean;
  onToggle: (attached: boolean) => void;
  onPreview: () => void;
}) {
  const t = useTranslations("skills.lab");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: path,
  });
  const style: React.CSSProperties = {
    ...s.row(isDragging),
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const name = path.split("/").pop() ?? path;
  const missing = !doc;

  return (
    <div ref={setNodeRef} style={style}>
      <span {...attributes} {...listeners} style={s.dragHandle} aria-label={t("contextTab.dragHandle")}>
        <Icon.Menu size={14} />
      </span>
      <Checkbox checked={attached} onChange={onToggle} />
      <div style={s.rowNameWrap}>
        <span style={attached ? s.rowName : { ...s.rowName, ...s.rowDisabledName }}>{name}</span>
        <span style={s.rowPath}>{path}</span>
      </div>
      {missing ? (
        <span className="mono" style={s.missingChip}>
          {t("contextTab.missing")}
        </span>
      ) : (
        <span className="mono" style={s.typeChip(FOLDER_BADGE_COLOR[doc.folder_type])}>
          {doc.folder_type}
        </span>
      )}
      {doc && (
        <span style={s.tokenChip}>{t("contextTab.tokenCount", { count: doc.tokens })}</span>
      )}
      <button
        type="button"
        onClick={onPreview}
        disabled={missing}
        aria-label={t("contextTab.preview")}
        title={t("contextTab.preview")}
        style={s.previewBtn}
      >
        <Icon.Eye size={14} />
      </button>
    </div>
  );
}
