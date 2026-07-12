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
import { Icon, Button } from "@devdigest/ui";
import type { Agent, ContextDoc } from "@devdigest/shared";
import { useActiveRepo } from "@/lib/repo-context";
import { useAgentContext, useContextFiles, useSetAgentContext } from "@/lib/hooks/context";
import { useToast } from "@/lib/toast";
import { PreviewModal } from "./_components/PreviewModal";
import { SortableRow } from "./_components/SortableRow";
import { DRAG_ACTIVATION_DISTANCE } from "./constants";
import { filterRows, linksToPaths, samePaths, totalTokens, type ContextRow } from "./helpers";
import { s } from "./styles";

/** Agent-editor Context tab — mirrors SkillsTab: dnd-kit reorder, checkbox
 *  attach, filter, per-row preview, folder badge, "N of M attached", per-doc +
 *  total token counts, missing-path rows (AC-10..AC-14, AC-18). */
export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents.context");
  const toast = useToast();
  const { repoId } = useActiveRepo();

  const { data: linksRemote } = useAgentContext(agent.id);
  const { data: docs } = useContextFiles(repoId);
  const save = useSetAgentContext(agent.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }),
  );

  const [attachedPaths, setAttachedPaths] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState("");
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (linksRemote) setAttachedPaths(linksToPaths(linksRemote));
  }, [linksRemote, agent.id]);

  const docsByPath = React.useMemo(() => {
    const m = new Map<string, ContextDoc>();
    for (const d of docs ?? []) m.set(d.path, d);
    return m;
  }, [docs]);

  const attachedSet = new Set(attachedPaths);
  const attachedRows: ContextRow[] = attachedPaths.map((path) => ({
    path,
    doc: docsByPath.get(path) ?? null,
    attached: true,
  }));
  const unattachedRows: ContextRow[] = (docs ?? [])
    .filter((d) => !attachedSet.has(d.path))
    .map((d) => ({ path: d.path, doc: d, attached: false }));

  const visibleAttached = filterRows(attachedRows, search);
  const visibleUnattached = filterRows(unattachedRows, search);

  const total = docs?.length ?? 0;
  const attachedTotal = attachedPaths.length;
  const tokenTotal = totalTokens(attachedPaths, docsByPath);
  const dirty = linksRemote ? !samePaths(linksToPaths(linksRemote), attachedPaths) : false;

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = attachedPaths.findIndex((p) => p === active.id);
    const newIndex = attachedPaths.findIndex((p) => p === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setAttachedPaths(arrayMove(attachedPaths, oldIndex, newIndex));
  };

  const onAttach = (path: string) => setAttachedPaths((cur) => [...cur, path]);
  const onDetach = (path: string) => setAttachedPaths((cur) => cur.filter((p) => p !== path));

  const onSave = () =>
    save.mutate(
      { docs: attachedPaths.map((path, order) => ({ path, order })) },
      { onSuccess: () => toast.success(t("savedToast")) },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("title")}</h2>
        <span style={s.countBadge}>{t("attachedCount", { linked: attachedTotal, total })}</span>
        <span style={s.tokenBadge}>{t("totalTokens", { count: tokenTotal })}</span>
        <div style={s.filter}>
          <Icon.Search size={13} style={s.filterIcon} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.helper}>{t("orderHint")}</p>

      {total === 0 ? (
        <div style={s.empty}>{t("empty")}</div>
      ) : (
        <>
          {attachedTotal > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={visibleAttached.map((r) => r.path)}
                strategy={verticalListSortingStrategy}
              >
                <div style={s.list}>
                  {visibleAttached.map((r) => (
                    <SortableRow
                      key={r.path}
                      row={r}
                      sortable
                      onToggle={(v) => (v ? onAttach(r.path) : onDetach(r.path))}
                      onPreview={() => setPreviewPath(r.path)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {visibleUnattached.length > 0 && (
            <>
              <div style={s.sectionLabel}>{t("available")}</div>
              <div style={s.list}>
                {visibleUnattached.map((r) => (
                  <SortableRow
                    key={r.path}
                    row={r}
                    sortable={false}
                    onToggle={(v) => (v ? onAttach(r.path) : onDetach(r.path))}
                    onPreview={() => setPreviewPath(r.path)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div style={s.actionsRow}>
        <Button
          kind="primary"
          size="sm"
          icon="Check"
          onClick={onSave}
          disabled={!dirty || save.isPending}
        >
          {save.isPending ? t("saving") : t("save")}
        </Button>
        {save.isSuccess && !dirty && <span style={s.savedNote}>{t("saved")}</span>}
      </div>

      {previewPath && (
        <PreviewModal repoId={repoId} path={previewPath} onClose={() => setPreviewPath(null)} />
      )}
    </div>
  );
}
