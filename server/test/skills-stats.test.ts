import { describe, expect, it } from 'vitest';
import { computeListStats, computeStatsForSkill, containsSkillId } from '../src/modules/skills/stats.js';

/** Helpers — keep the fixture-builders terse so the assertions stay readable. */
const finding = (agentId: string, category: string, accepted: boolean) => ({
  agentId,
  category,
  acceptedAt: accepted ? new Date() : null,
});

describe('containsSkillId', () => {
  it('matches when the array contains an entry with the right id', () => {
    expect(containsSkillId([{ id: 'sk-1', body: 'x' }], 'sk-1')).toBe(true);
  });

  it('returns false for null / non-array / wrong shape', () => {
    expect(containsSkillId(null, 'sk-1')).toBe(false);
    expect(containsSkillId(undefined, 'sk-1')).toBe(false);
    expect(containsSkillId({ id: 'sk-1' }, 'sk-1')).toBe(false);
    expect(containsSkillId([{ name: 'sk-1' }], 'sk-1')).toBe(false);
  });

  it('returns false when no entry matches', () => {
    expect(containsSkillId([{ id: 'sk-2' }, { id: 'sk-3' }], 'sk-1')).toBe(false);
  });
});

describe('computeStatsForSkill', () => {
  const agentsUsing = [
    { id: 'ag-sec', name: 'Security Reviewer' },
    { id: 'ag-perf', name: 'Performance Reviewer' },
  ];

  it('rolls up usage / pull / accept across the fetched rows', () => {
    const runs = [
      { runId: 'r1', agentId: 'ag-sec' },
      { runId: 'r2', agentId: 'ag-sec' },
      { runId: 'r3', agentId: 'ag-perf' },
      { runId: 'r4', agentId: 'ag-perf' },
    ];
    const runBlocks = [
      { runId: 'r1', blocks: [{ id: 'sk-1' }] },                  // injected
      { runId: 'r2', blocks: [{ id: 'sk-other' }] },              // not injected
      { runId: 'r3', blocks: [{ id: 'sk-1' }, { id: 'sk-2' }] },  // injected
      { runId: 'r4', blocks: null },                              // pre-skills trace
    ];
    const findings = [
      finding('ag-sec', 'security', true),
      finding('ag-sec', 'security', false),
      finding('ag-perf', 'bug', true),
      finding('ag-perf', 'perf', false),
    ];

    const out = computeStatsForSkill('sk-1', { agentsUsing, runs, runBlocks, findings });

    expect(out.used_by).toBe(2);
    // 2 of 4 runs actually injected sk-1.
    expect(out.pull_frequency_pct).toBe(50);
    // 2 of 4 findings accepted.
    expect(out.accept_rate_pct).toBe(50);
    expect(out.findings_count_30d).toBe(4);
    expect(out.findings_by_category).toEqual([
      { category: 'security', value: 2 }, // sorted desc by count
      { category: 'bug', value: 1 },
      { category: 'perf', value: 1 },
    ]);
    expect(out.agents_using).toEqual(agentsUsing);
  });

  it('handles a freshly-created skill with no runs / no findings (no division by zero)', () => {
    const out = computeStatsForSkill('sk-new', {
      agentsUsing: [{ id: 'ag-sec', name: 'Security' }],
      runs: [],
      runBlocks: [],
      findings: [],
    });
    expect(out.used_by).toBe(1);
    expect(out.pull_frequency_pct).toBe(0);
    expect(out.accept_rate_pct).toBe(0);
    expect(out.findings_count_30d).toBe(0);
    expect(out.findings_by_category).toEqual([]);
  });

  it('ignores rows whose agent is NOT bound to this skill', () => {
    // Findings produced by an agent that doesn't have sk-1 must not inflate
    // the skill's stats — the service trusts the agentId join we did above.
    const out = computeStatsForSkill('sk-1', {
      agentsUsing: [{ id: 'ag-sec', name: 'Security' }],
      runs: [
        { runId: 'r1', agentId: 'ag-sec' },
        { runId: 'r2', agentId: 'ag-other' }, // not in agentsUsing
      ],
      runBlocks: [{ runId: 'r2', blocks: [{ id: 'sk-1' }] }],
      findings: [finding('ag-other', 'security', true)],
    });
    // r2 is filtered out before pull math; findings from ag-other are dropped.
    expect(out.pull_frequency_pct).toBe(0);
    expect(out.findings_count_30d).toBe(0);
  });
});

describe('computeListStats', () => {
  it('buckets per skill from a single fetched payload', () => {
    const skillIds = ['sk-a', 'sk-b'];
    const stats = computeListStats(skillIds, {
      agentLinks: [
        { skillId: 'sk-a', agentId: 'ag-1', agentName: 'Sec' },
        { skillId: 'sk-a', agentId: 'ag-2', agentName: 'Perf' },
        { skillId: 'sk-b', agentId: 'ag-2', agentName: 'Perf' },
      ],
      runs: [
        { runId: 'r1', agentId: 'ag-1' },
        { runId: 'r2', agentId: 'ag-2' },
      ],
      runBlocks: [
        { runId: 'r1', blocks: [{ id: 'sk-a' }] },
        { runId: 'r2', blocks: [{ id: 'sk-b' }] },
      ],
      findings: [
        finding('ag-1', 'security', true),
        finding('ag-2', 'bug', false),
      ],
    });
    expect(stats.get('sk-a')).toEqual({
      agents_count: 2,           // ag-1 + ag-2 bound to sk-a
      pull_frequency_pct: 50,    // r1 injected sk-a, r2 didn't → 1/2
      accept_rate_pct: 50,       // 1 accepted of 2 findings
    });
    expect(stats.get('sk-b')).toEqual({
      agents_count: 1,
      pull_frequency_pct: 100,
      accept_rate_pct: 0,
    });
  });

  it('returns zeroes for a skill with no agent bindings yet', () => {
    const stats = computeListStats(['sk-orphan'], {
      agentLinks: [],
      runs: [],
      runBlocks: [],
      findings: [],
    });
    expect(stats.get('sk-orphan')).toEqual({
      agents_count: 0,
      pull_frequency_pct: 0,
      accept_rate_pct: 0,
    });
  });

  it('deduplicates agent links (same agent listed twice for the same skill)', () => {
    const stats = computeListStats(['sk-a'], {
      agentLinks: [
        { skillId: 'sk-a', agentId: 'ag-1', agentName: 'Sec' },
        { skillId: 'sk-a', agentId: 'ag-1', agentName: 'Sec' },
      ],
      runs: [],
      runBlocks: [],
      findings: [],
    });
    expect(stats.get('sk-a')?.agents_count).toBe(1);
  });
});
