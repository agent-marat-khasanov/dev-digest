"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox, Icon } from "@devdigest/ui";
import { FOLDER_COLOR } from "../../constants";
import { docName, type ContextRow } from "../../helpers";
import { s } from "../../styles";

/** One doc row — draggable only when attached (order only matters for attached
 *  docs); the checkbox attaches/detaches. Missing docs (AC-18) render muted
 *  with a "missing" badge instead of erroring. */
export function SortableRow({
  row,
  sortable,
  onToggle,
  onPreview,
}: {
  row: ContextRow;
  sortable: boolean;
  onToggle: (attached: boolean) => void;
  onPreview: () => void;
}) {
  const t = useTranslations("agents.context");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.path,
    disabled: !sortable,
  });
  const missing = row.attached && !row.doc;
  const style: React.CSSProperties = {
    ...s.row(isDragging, missing),
    transform: sortable ? CSS.Transform.toString(transform) : undefined,
    transition: sortable ? transition : undefined,
  };
  const color = row.doc ? FOLDER_COLOR[row.doc.folder_type] : "var(--text-muted)";

  return (
    <div ref={setNodeRef} style={style}>
      {sortable ? (
        <span {...attributes} {...listeners} style={s.dragHandle} aria-label={t("dragHandle")}>
          <Icon.Menu size={14} />
        </span>
      ) : (
        <span style={s.dragHandleDisabled}>
          <Icon.Menu size={14} />
        </span>
      )}
      <Checkbox checked={row.attached} onChange={onToggle} />
      <div style={s.rowNames}>
        <span style={row.attached ? s.rowName : { ...s.rowName, ...s.rowDisabledName }}>
          {docName(row.path)}
        </span>
        <span style={s.rowPath}>{row.path}</span>
      </div>
      {missing && <span style={s.missingBadge}>{t("missing")}</span>}
      {row.doc && (
        <span className="mono" style={s.folderChip(color)}>
          {row.doc.folder_type}
        </span>
      )}
      {row.doc && <span style={s.tokenCount}>{t("tokens", { count: row.doc.tokens })}</span>}
      {row.doc && (
        <button
          type="button"
          onClick={onPreview}
          aria-label={t("preview")}
          title={t("preview")}
          style={s.previewBtn}
        >
          <Icon.Eye size={14} />
        </button>
      )}
    </div>
  );
}
