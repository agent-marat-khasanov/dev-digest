import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** A bound link decorated with the resolved Skill (or null when the skill was deleted). */
export interface ResolvedLink {
  skillId: string;
  enabled: boolean;
  skill: Skill | null;
}

/** Substring filter on the skill name + description; drops links whose skill was deleted. */
export function filterResolved(rows: ResolvedLink[], search: string): ResolvedLink[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => {
    if (!r.skill) return false;
    return (
      r.skill.name.toLowerCase().includes(q) ||
      r.skill.description.toLowerCase().includes(q)
    );
  });
}

/** Deep-equal links (ids + enabled, in order). Cheap — never more than ~30 entries. */
export function sameLinks(
  a: Array<{ skill_id: string; enabled: boolean }>,
  b: Array<{ skill_id: string; enabled: boolean }>,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.skill_id !== b[i]!.skill_id || a[i]!.enabled !== b[i]!.enabled) return false;
  }
  return true;
}

/** Workspace skills that are NOT currently bound to this agent. */
export function unboundSkills(all: Skill[], links: Array<{ skill_id: string }>): Skill[] {
  const bound = new Set(links.map((l) => l.skill_id));
  return all.filter((s) => !bound.has(s.id));
}
