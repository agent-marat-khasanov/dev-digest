import type { SkillStats } from '@devdigest/shared';

/**
 * Pure stats aggregators. Take pre-fetched DB rows in, return the public DTO
 * shapes out. Kept in their own module (no Drizzle / Container / `this`) so
 * the maths is unit-testable in isolation — the repository owns the SQL.
 */

/** Shape of one bound agent — what the agent_skills × agents join projects. */
export interface AgentRef {
  id: string;
  name: string;
}

/** A recent agent_runs row (last 30 days for an agent-using-this-skill). */
export interface RunRow {
  runId: string;
  agentId: string;
}

/** The projected `skill_blocks` JSONB slice of one run's trace. */
export interface RunBlocks {
  runId: string;
  blocks: unknown;
}

/** A `findings` row joined back to its agent (via review → run). */
export interface FindingRow {
  category: string;
  acceptedAt: Date | null;
  agentId: string;
}

/**
 * Robust check: does this `skill_blocks` JSONB value contain a block with the
 * given skill id? Defensive on shape — pre-skills traces have `null` here, and
 * a corrupt array is treated as "no match" rather than crashing the endpoint.
 */
export function containsSkillId(blocks: unknown, skillId: string): boolean {
  if (!Array.isArray(blocks)) return false;
  for (const entry of blocks) {
    if (entry && typeof entry === 'object' && (entry as { id?: unknown }).id === skillId) {
      return true;
    }
  }
  return false;
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

/**
 * Single-skill rollup (drives GET /skills/:id/stats AND embeds into a single
 * card on the list view via {@link computeListStats}). Findings are filtered
 * server-side to `agentId ∈ agentsUsing`; we do NOT trust callers to pre-filter.
 */
export function computeStatsForSkill(
  skillId: string,
  input: {
    agentsUsing: AgentRef[];
    runs: RunRow[];
    runBlocks: RunBlocks[];
    findings: FindingRow[];
  },
): SkillStats {
  const agentIds = new Set(input.agentsUsing.map((a) => a.id));
  const skillRuns = input.runs.filter((r) => agentIds.has(r.agentId));
  const blocksByRun = new Map(input.runBlocks.map((b) => [b.runId, b.blocks] as const));
  const injectingCount = skillRuns.reduce(
    (n, r) => n + (containsSkillId(blocksByRun.get(r.runId), skillId) ? 1 : 0),
    0,
  );

  const scopedFindings = input.findings.filter((f) => agentIds.has(f.agentId));
  const findingsCount = scopedFindings.length;
  const accepted = scopedFindings.reduce((n, f) => n + (f.acceptedAt ? 1 : 0), 0);

  const catBuckets = new Map<string, number>();
  for (const f of scopedFindings) {
    catBuckets.set(f.category, (catBuckets.get(f.category) ?? 0) + 1);
  }

  return {
    used_by: input.agentsUsing.length,
    pull_frequency_pct: pct(injectingCount, skillRuns.length),
    accept_rate_pct: pct(accepted, findingsCount),
    findings_count_30d: findingsCount,
    agents_using: input.agentsUsing,
    findings_by_category: Array.from(catBuckets.entries())
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value),
  };
}

/** Compact per-skill numbers embedded on each list-view card. */
export interface ListStats {
  agents_count: number;
  pull_frequency_pct: number;
  accept_rate_pct: number;
}

/**
 * Per-skill rollup over an entire workspace. Same fetched payload powers every
 * card on the list view — the repository fetches once, this function buckets
 * per skill. `agentLinks` is the full agent_skills × agents join, projected to
 * (skill_id, agent_id, agent_name).
 */
export function computeListStats(
  skillIds: string[],
  input: {
    agentLinks: Array<{ skillId: string; agentId: string; agentName: string }>;
    runs: RunRow[];
    runBlocks: RunBlocks[];
    findings: FindingRow[];
  },
): Map<string, ListStats> {
  const linksBySkill = new Map<string, AgentRef[]>();
  for (const l of input.agentLinks) {
    const list = linksBySkill.get(l.skillId) ?? [];
    if (!list.some((a) => a.id === l.agentId)) list.push({ id: l.agentId, name: l.agentName });
    linksBySkill.set(l.skillId, list);
  }

  const out = new Map<string, ListStats>();
  for (const id of skillIds) {
    const agents = linksBySkill.get(id) ?? [];
    const full = computeStatsForSkill(id, {
      agentsUsing: agents,
      runs: input.runs,
      runBlocks: input.runBlocks,
      findings: input.findings,
    });
    out.set(id, {
      agents_count: full.used_by,
      pull_frequency_pct: full.pull_frequency_pct,
      accept_rate_pct: full.accept_rate_pct,
    });
  }
  return out;
}
