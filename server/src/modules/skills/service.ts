import * as Diff from 'diff';
import type { Container } from '../../platform/container.js';
import type {
  CommunitySkill,
  Skill,
  SkillSource,
  SkillStats,
  SkillType,
  SkillVersion,
  SkillVersionDiff,
} from '@devdigest/shared';
import { SkillsRepository, type ListSkillsFilter } from './repository.js';
import { toSkillDto, toSkillVersionDto } from './helpers.js';
import { COMMUNITY_SKILLS, filterCommunitySkills, type CommunityFilter } from './community.js';
import { computeListStats, computeStatsForSkill } from './stats.js';

/**
 * Skills service. Business logic for the Skills tab (list/create/edit/import),
 * the per-skill stats rollup, and the version restore/diff actions.
 */

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
  evidence_files?: string[] | null;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  evidence_files?: string[] | null;
}

const STATS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string, filter: ListSkillsFilter = {}): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId, filter);
    const skills = rows.map(toSkillDto);
    if (skills.length === 0) return skills;

    const since = new Date(Date.now() - STATS_WINDOW_MS);
    const agentLinks = await this.repo.allAgentLinks(workspaceId);
    const agentIds = Array.from(new Set(agentLinks.map((l) => l.agentId)));
    const runs = await this.repo.recentRuns(workspaceId, agentIds, since);
    const runBlocks = runs.length > 0 ? await this.repo.runBlocks(runs.map((r) => r.runId)) : [];
    const findings = await this.repo.findingsForAgents(workspaceId, agentIds, since);

    const stats = computeListStats(
      skills.map((s) => s.id),
      { agentLinks, runs, runBlocks, findings },
    );

    return skills.map((s) => {
      const st = stats.get(s.id) ?? { agents_count: 0, pull_frequency_pct: 0, accept_rate_pct: 0 };
      return {
        ...s,
        agents_count: st.agents_count,
        pull_frequency_pct: st.pull_frequency_pct,
        accept_rate_pct: st.accept_rate_pct,
        body_tokens: this.container.tokenizer.count(s.body),
      };
    });
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    if (!row) return undefined;
    const dto = toSkillDto(row);
    return { ...dto, body_tokens: this.container.tokenizer.count(dto.body) };
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: input.source ?? 'manual',
      body: input.body,
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.evidence_files !== undefined ? { evidenceFiles: input.evidence_files } : {}),
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.evidence_files !== undefined ? { evidenceFiles: patch.evidence_files } : {}),
    });
    if (!row) return undefined;
    const dto = toSkillDto(row);
    return { ...dto, body_tokens: this.container.tokenizer.count(dto.body) };
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map(toSkillVersionDto);
  }

  /**
   * Restore a prior version by re-running the update path with its body —
   * this preserves the audit trail (the restored body becomes a new version,
   * the old version row stays untouched). Returns the freshly-updated skill.
   */
  async restoreVersion(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<Skill | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const snap = await this.repo.getVersion(skillId, version);
    if (!snap) return undefined;
    if (snap.body === skill.body) {
      // Nothing to do — restoring the body that's already current is a no-op
      // rather than a bumped version, otherwise every "restore current" click
      // would inflate the history.
      const dto = toSkillDto(skill);
      return { ...dto, body_tokens: this.container.tokenizer.count(dto.body) };
    }
    return this.update(workspaceId, skillId, { body: snap.body });
  }

  /**
   * Unified diff of a prior version's body vs the current body. Empty body on
   * either side is fine — `diff` handles it. Returns a single hunk per the
   * standard unified format.
   */
  async getVersionDiff(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<SkillVersionDiff | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const snap = await this.repo.getVersion(skillId, version);
    if (!snap) return undefined;
    const unified = Diff.createTwoFilesPatch(
      `v${version}`,
      `v${skill.version} (current)`,
      snap.body,
      skill.body,
      '',
      '',
      { context: 3 },
    );
    return { unified };
  }

  /**
   * 30-day per-skill rollup. Returns undefined when the skill isn't in this
   * workspace (route maps that to 404). Re-uses the same data fetchers as the
   * list endpoint so the math agrees with the cards.
   */
  async getStats(workspaceId: string, skillId: string): Promise<SkillStats | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const agentsUsing = await this.repo.agentsUsingSkill(workspaceId, skillId);
    const since = new Date(Date.now() - STATS_WINDOW_MS);
    const agentIds = agentsUsing.map((a) => a.id);
    const runs = await this.repo.recentRuns(workspaceId, agentIds, since);
    const runBlocks = runs.length > 0 ? await this.repo.runBlocks(runs.map((r) => r.runId)) : [];
    const findings = await this.repo.findingsForAgents(workspaceId, agentIds, since);
    return computeStatsForSkill(skillId, { agentsUsing, runs, runBlocks, findings });
  }

  /** Public community catalogue (fixture for now) — filtered server-side. */
  listCommunity(filter: CommunityFilter = {}): CommunitySkill[] {
    return filterCommunitySkills(COMMUNITY_SKILLS, filter);
  }
}
