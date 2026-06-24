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
import type { Agent, Skill } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { AddSkillPopover } from "./_components/AddSkillPopover";
import { SortableRow } from "./_components/SortableRow";
import { DRAG_ACTIVATION_DISTANCE } from "./constants";
import { filterResolved, sameLinks, unboundSkills, type ResolvedLink } from "./helpers";
import { s } from "./styles";

type LocalLink = { skill_id: string; enabled: boolean };

/**
 * Skills tab for the Agent Editor. Lists bound skills with drag-to-reorder
 * and per-link enable; "+ Add skill" opens a popover of unbound workspace
 * skills; Save POSTs the full ordered+toggled list to /agents/:id/skills.
 */
export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("skills.lab");
  const toast = useToast();

  const { data: linksRemote } = useAgentSkills(agent.id);
  const { data: workspaceSkills } = useSkills();
  const save = useSetAgentSkills(agent.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }),
  );

  const [links, setLinks] = React.useState<LocalLink[]>([]);
  const [search, setSearch] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  // Re-seed local links whenever the server payload arrives or the agent changes.
  React.useEffect(() => {
    if (linksRemote) setLinks(linksRemote.map((l) => ({ skill_id: l.skill_id, enabled: l.enabled })));
  }, [linksRemote, agent.id]);

  const skillsById = React.useMemo(() => {
    const m = new Map<string, Skill>();
    for (const sk of workspaceSkills ?? []) m.set(sk.id, sk);
    return m;
  }, [workspaceSkills]);

  const resolved: ResolvedLink[] = links.map((l) => ({
    skillId: l.skill_id,
    enabled: l.enabled,
    skill: skillsById.get(l.skill_id) ?? null,
  }));
  const visible = filterResolved(resolved, search);
  const candidates = unboundSkills(workspaceSkills ?? [], links);

  const linkedTotal = links.length;
  const enabledTotal = links.filter((l) => l.enabled).length;
  const dirty = linksRemote ? !sameLinks(linksRemote.map((l) => ({ skill_id: l.skill_id, enabled: l.enabled })), links) : false;

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = links.findIndex((l) => l.skill_id === active.id);
    const newIndex = links.findIndex((l) => l.skill_id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setLinks(arrayMove(links, oldIndex, newIndex));
  };

  const onToggle = (skillId: string, enabled: boolean) => {
    setLinks((cur) => cur.map((l) => (l.skill_id === skillId ? { ...l, enabled } : l)));
  };
  const onRemove = (skillId: string) => {
    setLinks((cur) => cur.filter((l) => l.skill_id !== skillId));
  };
  const onAdd = (skill: Skill) => {
    setLinks((cur) => [...cur, { skill_id: skill.id, enabled: true }]);
  };

  const onSave = () =>
    save.mutate(
      { links },
      {
        onSuccess: () => toast.success(t("agentTab.savedToast")),
      },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("agentTab.title")}</h2>
        <span style={s.countBadge}>
          {t("agentTab.enabledCount", { linked: enabledTotal, total: linkedTotal })}
        </span>
        <div style={s.filter}>
          <Icon.Search size={13} style={s.filterIcon} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("agentTab.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.helper}>{t("agentTab.orderHint")}</p>

      {linkedTotal === 0 ? (
        <div style={s.empty}>{t("agentTab.empty")}</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visible.map((r) => r.skillId)} strategy={verticalListSortingStrategy}>
            <div style={s.list}>
              {visible.map((r) => (
                <SortableRow
                  key={r.skillId}
                  skillId={r.skillId}
                  skill={r.skill}
                  enabled={r.enabled}
                  onToggle={(v) => onToggle(r.skillId, v)}
                  onRemove={() => onRemove(r.skillId)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div style={s.actionsRow}>
        <Button kind="ghost" size="sm" icon="Plus" onClick={() => setAdding((v) => !v)}>
          {t("agentTab.addSkill")}
        </Button>
        <Button
          kind="primary"
          size="sm"
          icon="Check"
          onClick={onSave}
          disabled={!dirty || save.isPending}
        >
          {save.isPending ? t("agentTab.saving") : t("agentTab.save")}
        </Button>
        {save.isSuccess && !dirty && <span style={s.savedNote}>{t("agentTab.saved")}</span>}
        {adding && (
          <AddSkillPopover candidates={candidates} onAdd={onAdd} onClose={() => setAdding(false)} />
        )}
      </div>
    </div>
  );
}
