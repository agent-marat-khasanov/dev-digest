"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Button, Icon } from "@devdigest/ui";
import type { ContextDoc, Skill } from "@devdigest/shared";
import { useContextFiles, useSetSkillContext, useSkillContext } from "@/lib/hooks/context";
import { useActiveRepo } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { PreviewModal } from "./_components/PreviewModal";
import { SortableRow } from "./_components/SortableRow";
import { DRAG_ACTIVATION_DISTANCE } from "./constants";
import { buildInitialOrder, filterRows, sameAttachedOrder, type ContextRow } from "./helpers";
import { s } from "./styles";

/**
 * "Project context to use" tab for the Skill editor — equivalent to the
 * agent Context tab (AC-15). Lists every discovered repo doc as a row with
 * drag-to-reorder, an attach checkbox, a folder badge, per-doc + total token
 * counts, and a filter. Any agent using this skill inherits attached docs.
 */
export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills.lab");
  const toast = useToast();
  const { repoId } = useActiveRepo();

  const { data: contextList } = useContextFiles(repoId);
  const docs = contextList?.docs;
  const { data: linksRemote } = useSkillContext(skill.id);
  const save = useSetSkillContext(skill.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }),
  );

  const [order, setOrder] = React.useState<string[]>([]);
  const [attached, setAttached] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState("");
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  // Re-seed local order/attach state whenever discovery + saved links arrive
  // (or the skill changes).
  React.useEffect(() => {
    if (!docs || !linksRemote) return;
    setOrder(buildInitialOrder(docs, linksRemote));
    setAttached(new Set(linksRemote.map((l) => l.path)));
  }, [docs, linksRemote, skill.id]);

  const docsByPath = React.useMemo(() => {
    const m = new Map<string, ContextDoc>();
    for (const d of docs ?? []) m.set(d.path, d);
    return m;
  }, [docs]);

  const rows: ContextRow[] = order.map((path) => ({ path, doc: docsByPath.get(path) ?? null }));
  const visible = filterRows(rows, search);

  const attachedTotal = attached.size;
  const totalTokens = rows.reduce(
    (sum, r) => (attached.has(r.path) && r.doc ? sum + r.doc.tokens : sum),
    0,
  );

  const currentAttachedLinks = order
    .filter((p) => attached.has(p))
    .map((path, i) => ({ path, order: i }));
  const dirty = linksRemote ? !sameAttachedOrder(linksRemote, currentAttachedLinks) : false;

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setOrder(arrayMove(order, oldIndex, newIndex));
  };

  const onToggle = (path: string, checked: boolean) => {
    setAttached((cur) => {
      const next = new Set(cur);
      if (checked) next.add(path);
      else next.delete(path);
      return next;
    });
  };

  const onSave = () =>
    save.mutate(
      { docs: currentAttachedLinks },
      { onSuccess: () => toast.success(t("contextTab.savedToast")) },
    );

  if (!repoId) {
    return <div style={s.empty}>{t("contextTab.noRepo")}</div>;
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("contextTab.title")}</h2>
        <span style={s.countBadge}>{t("contextTab.attachedCount", { count: attachedTotal })}</span>
        <div style={s.filter}>
          <Icon.Search size={13} style={s.filterIcon} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("contextTab.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.helper}>{t("contextTab.inheritHint")}</p>

      {rows.length === 0 ? (
        <div style={s.empty}>{t("contextTab.empty")}</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visible.map((r) => r.path)} strategy={verticalListSortingStrategy}>
            <div style={s.list}>
              {visible.map((r) => (
                <SortableRow
                  key={r.path}
                  path={r.path}
                  doc={r.doc}
                  attached={attached.has(r.path)}
                  onToggle={(v) => onToggle(r.path, v)}
                  onPreview={() => setPreviewPath(r.path)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {totalTokens > 0 && (
        <p style={s.tokenTotal}>{t("contextTab.totalTokens", { count: totalTokens })}</p>
      )}

      <div style={s.actionsRow}>
        <Button
          kind="primary"
          size="sm"
          icon="Check"
          onClick={onSave}
          disabled={!dirty || save.isPending}
        >
          {save.isPending ? t("contextTab.saving") : t("contextTab.save")}
        </Button>
        {save.isSuccess && !dirty && <span style={s.savedNote}>{t("contextTab.saved")}</span>}
      </div>

      {previewPath && (
        <PreviewModal repoId={repoId} path={previewPath} onClose={() => setPreviewPath(null)} />
      )}
    </div>
  );
}
