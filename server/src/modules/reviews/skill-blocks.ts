import type { SkillBlock } from '@devdigest/shared';

/**
 * Pure filter + tokenisation step used by the review run executor. A skill
 * is active for THIS run only when both `skill.enabled` (globally on) AND
 * the `agent_skills.enabled` link (per-agent on) are true. Input order is
 * preserved — callers fetch linked skills in `order ASC`.
 *
 * Kept in its own file (no reviewer-core / repository imports) so it loads
 * cleanly in unit tests without dragging in the wider review module.
 */
export function selectActiveSkillBlocks(
  linked: Array<{
    skill: { id: string; name: string; body: string; enabled: boolean };
    enabled: boolean;
  }>,
  tokens: (text: string) => number,
): SkillBlock[] {
  const active = linked.filter((l) => l.skill.enabled && l.enabled);
  return active.map((l) => ({
    id: l.skill.id,
    name: l.skill.name,
    body: l.skill.body,
    tokens: tokens(l.skill.body),
  }));
}
