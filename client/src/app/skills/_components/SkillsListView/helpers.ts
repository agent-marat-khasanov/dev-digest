import type { Skill } from "@devdigest/shared";

/** Substring filter on name + description (case-insensitive). */
export function filterSkills(list: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
  );
}
