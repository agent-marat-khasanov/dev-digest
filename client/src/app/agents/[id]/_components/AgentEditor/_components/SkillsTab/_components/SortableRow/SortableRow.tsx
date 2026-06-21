"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox, Icon } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { TYPE_COLOR } from "@/app/skills/_components/SkillCard/constants";
import { s } from "../../styles";

export function SortableRow({
  skillId,
  skill,
  enabled,
  onToggle,
  onRemove,
}: {
  skillId: string;
  skill: Skill | null;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: skillId,
  });
  const style: React.CSSProperties = {
    ...s.row(isDragging),
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const color = skill ? TYPE_COLOR[skill.type] : "var(--text-muted)";
  const label = skill?.name ?? `(deleted ${skillId.slice(0, 8)})`;
  return (
    <div ref={setNodeRef} style={style}>
      <span {...attributes} {...listeners} style={s.dragHandle} aria-label="Drag to reorder">
        <Icon.Menu size={14} />
      </span>
      <Checkbox checked={enabled} onChange={onToggle} />
      <span style={enabled ? s.rowName : { ...s.rowName, ...s.rowDisabledName }}>{label}</span>
      {skill && (
        <span className="mono" style={s.typeChip(color)}>
          {skill.type}
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Unlink skill"
        title="Unlink skill"
        style={s.removeBtn}
      >
        <Icon.X size={14} />
      </button>
    </div>
  );
}
