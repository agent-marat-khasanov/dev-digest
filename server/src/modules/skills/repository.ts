import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import { INITIAL_SKILL_VERSION } from './constants.js';
import type { AgentRef, FindingRow, RunBlocks, RunRow } from './stats.js';

/**
 * Skills data-access. Owns `skills` and `skill_versions`. Workspace-scoped.
 * The `agent_skills` link table is owned by the agents repository (A2); this
 * module never writes to it directly.
 */

export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
}

export interface ListSkillsFilter {
  type?: SkillType;
  enabled?: boolean;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string, filter: ListSkillsFilter = {}): Promise<SkillRow[]> {
    const where = [eq(t.skills.workspaceId, workspaceId)];
    if (filter.type !== undefined) where.push(eq(t.skills.type, filter.type));
    if (filter.enabled !== undefined) where.push(eq(t.skills.enabled, filter.enabled));
    return this.db
      .select()
      .from(t.skills)
      .where(and(...where));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /**
   * Fetch many skills at once, scoped to a workspace. Used by the reviews
   * executor to resolve linked skills for an agent without N round-trips.
   */
  async getByIds(workspaceId: string, ids: string[]): Promise<SkillRow[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId));
    const set = new Set(ids);
    return rows.filter((r) => set.has(r.id));
  }

  /** Insert a skill AND record version 1 in skill_versions (immutable snapshot). */
  async insert(values: InsertSkill): Promise<SkillRow> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description,
        type: values.type,
        source: values.source,
        body: values.body,
        enabled: values.enabled ?? true,
        version: INITIAL_SKILL_VERSION,
        evidenceFiles: values.evidenceFiles ?? null,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_SKILL_VERSION);
    return row!;
  }

  /**
   * Update a skill. A change to `body` (the prompt-injected text) bumps
   * version and snapshots into skill_versions. Renames / description / enabled
   * / type / evidence_files changes are not body-changes and do NOT bump.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
  ): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const bodyChanged = patch.body !== undefined && patch.body !== existing.body;
    const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.skills)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.evidenceFiles !== undefined ? { evidenceFiles: patch.evidenceFiles } : {}),
        ...(bodyChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();

    if (bodyChanged && row) await this.snapshotVersion(row, nextVersion);
    return row;
  }

  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  // ---- Stats data fetchers (raw rows — pure aggregators live in stats.ts) --

  /** Distinct agents currently bound to the given skill in the workspace. */
  async agentsUsingSkill(workspaceId: string, skillId: string): Promise<AgentRef[]> {
    const rows = await this.db
      .selectDistinct({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(and(eq(t.agentSkills.skillId, skillId), eq(t.agents.workspaceId, workspaceId)));
    return rows;
  }

  /**
   * Agent_runs rows in `[since, now]` for the given agent ids (capped to the
   * most recent 500 — keeps the JSONB-blocks fetch cheap downstream).
   */
  async recentRuns(workspaceId: string, agentIds: string[], since: Date): Promise<RunRow[]> {
    if (agentIds.length === 0) return [];
    const rows = await this.db
      .select({ runId: t.agentRuns.id, agentId: t.agentRuns.agentId })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          inArray(t.agentRuns.agentId, agentIds),
          gte(t.agentRuns.ranAt, since),
        ),
      )
      .orderBy(desc(t.agentRuns.ranAt))
      .limit(500);
    return rows.map((r) => ({ runId: r.runId, agentId: r.agentId ?? '' })).filter((r) => r.agentId);
  }

  /**
   * Project only the `skill_blocks` slice of each trace — the rest of the
   * JSONB blob can be large, this keeps the page small enough for one round
   * trip even when 500 runs match.
   */
  async runBlocks(runIds: string[]): Promise<RunBlocks[]> {
    if (runIds.length === 0) return [];
    const rows = await this.db
      .select({
        runId: t.runTraces.runId,
        blocks: sql<unknown>`${t.runTraces.trace} -> 'prompt_assembly' -> 'skill_blocks'`,
      })
      .from(t.runTraces)
      .where(inArray(t.runTraces.runId, runIds));
    return rows;
  }

  /** Findings within the window, joined back to the agent that produced them. */
  async findingsForAgents(workspaceId: string, agentIds: string[], since: Date): Promise<FindingRow[]> {
    if (agentIds.length === 0) return [];
    const rows = await this.db
      .select({
        category: t.findings.category,
        acceptedAt: t.findings.acceptedAt,
        agentId: t.agentRuns.agentId,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.reviews.runId))
      .where(
        and(
          eq(t.reviews.workspaceId, workspaceId),
          inArray(t.agentRuns.agentId, agentIds),
          gte(t.agentRuns.ranAt, since),
        ),
      );
    return rows.map((r) => ({
      category: r.category,
      acceptedAt: r.acceptedAt,
      agentId: r.agentId ?? '',
    }));
  }

  /** Workspace-wide agent_skills × agents join for the list-stats aggregator. */
  async allAgentLinks(workspaceId: string): Promise<Array<{ skillId: string; agentId: string; agentName: string }>> {
    const rows = await this.db
      .select({
        skillId: t.agentSkills.skillId,
        agentId: t.agents.id,
        agentName: t.agents.name,
      })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(eq(t.agents.workspaceId, workspaceId));
    return rows;
  }

  private async snapshotVersion(row: SkillRow, version: number): Promise<void> {
    await this.db
      .insert(t.skillVersions)
      .values({
        skillId: row.id,
        version,
        body: row.body,
      })
      .onConflictDoNothing();
  }
}
