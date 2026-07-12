import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * context module data-access. Owns the `agent_context` / `skill_context`
 * ordered-path link tables (paths only — never doc text, AC-17). Workspace
 * scoping for these tables is enforced by the owning agent/skill row, exactly
 * like `agent_skills` (no `workspace_id` column on the link table itself).
 */

export interface ContextLinkInput {
  path: string;
  order: number;
}

export interface AgentContextRow {
  agentId: string;
  path: string;
  order: number;
}

export interface SkillContextRow {
  skillId: string;
  path: string;
  order: number;
}

/** One doc path a given agent inherits from an ENABLED linked skill. */
export interface InheritedContextRow {
  path: string;
  /** The skill's own attach order (agent-skills order, then skill_context order). */
  skillLinkOrder: number;
  skillContextOrder: number;
}

export class ContextRepository {
  constructor(private db: Db) {}

  // ---- agent_context --------------------------------------------------

  async listAgentContext(agentId: string): Promise<AgentContextRow[]> {
    return this.db
      .select()
      .from(t.agentContext)
      .where(eq(t.agentContext.agentId, agentId))
      .orderBy(asc(t.agentContext.order));
  }

  /** Replace the full ordered set of docs attached to an agent. */
  async setAgentContext(agentId: string, docs: ContextLinkInput[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.agentContext).where(eq(t.agentContext.agentId, agentId));
      if (docs.length === 0) return;
      await tx
        .insert(t.agentContext)
        .values(docs.map((d) => ({ agentId, path: d.path, order: d.order })));
    });
  }

  // ---- skill_context ----------------------------------------------------

  async listSkillContext(skillId: string): Promise<SkillContextRow[]> {
    return this.db
      .select()
      .from(t.skillContext)
      .where(eq(t.skillContext.skillId, skillId))
      .orderBy(asc(t.skillContext.order));
  }

  /** Replace the full ordered set of docs attached to a skill. */
  async setSkillContext(skillId: string, docs: ContextLinkInput[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.skillContext).where(eq(t.skillContext.skillId, skillId));
      if (docs.length === 0) return;
      await tx
        .insert(t.skillContext)
        .values(docs.map((d) => ({ skillId, path: d.path, order: d.order })));
    });
  }

  /**
   * Ordered doc paths an agent inherits from its ENABLED skills — gated on
   * both `skills.enabled` (global) and `agent_skills.enabled` (per-agent),
   * mirroring `AgentsRepository.linkedSkills`. Ordered by the skill's link
   * order on the agent, then each skill's own context order (T6 dedupes and
   * flattens this after concatenating with the agent's own docs).
   */
  async skillInheritedContext(agentId: string): Promise<InheritedContextRow[]> {
    const rows = await this.db
      .select({
        path: t.skillContext.path,
        skillLinkOrder: t.agentSkills.order,
        skillContextOrder: t.skillContext.order,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .innerJoin(t.skillContext, eq(t.skillContext.skillId, t.skills.id))
      .where(
        and(
          eq(t.agentSkills.agentId, agentId),
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
        ),
      )
      .orderBy(asc(t.agentSkills.order), asc(t.skillContext.order));
    return rows;
  }
}
