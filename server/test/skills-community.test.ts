import { describe, expect, it } from 'vitest';
import type { CommunitySkill, SkillType } from '@devdigest/shared';
import { filterCommunitySkills, COMMUNITY_SKILLS } from '../src/modules/skills/community.js';

const skill = (name: string, lang: string, desc: string, type: SkillType = 'custom', repo = 'org/repo'): CommunitySkill => ({
  name,
  repo,
  stars: 0,
  lang,
  desc,
  type,
  body: '',
});

describe('filterCommunitySkills', () => {
  const list: CommunitySkill[] = [
    skill('owasp-top-10', 'any', 'OWASP Top 10 review', 'security', 'secdev/agent-skills'),
    skill('react-hooks-rules', 'TypeScript', 'Detects conditional hooks', 'convention', 'frontend-guild/skills'),
    skill('sql-injection-gate', 'any', 'Flags string-concatenated SQL', 'security', 'secdev/agent-skills'),
  ];

  it('returns the full list for empty / whitespace filters', () => {
    expect(filterCommunitySkills(list, {})).toHaveLength(3);
    expect(filterCommunitySkills(list, { q: '' })).toHaveLength(3);
    expect(filterCommunitySkills(list, { q: '   ', lang: '' })).toHaveLength(3);
  });

  it('matches the q substring case-insensitively against name, desc, and repo', () => {
    expect(filterCommunitySkills(list, { q: 'OWASP' }).map((s) => s.name)).toEqual(['owasp-top-10']);
    expect(filterCommunitySkills(list, { q: 'sql' }).map((s) => s.name)).toEqual(['sql-injection-gate']);
    expect(filterCommunitySkills(list, { q: 'frontend' }).map((s) => s.name)).toEqual(['react-hooks-rules']);
    expect(filterCommunitySkills(list, { q: 'CONDITIONAL' }).map((s) => s.name)).toEqual(['react-hooks-rules']);
  });

  it('exact-matches lang case-insensitively', () => {
    expect(filterCommunitySkills(list, { lang: 'typescript' }).map((s) => s.name)).toEqual(['react-hooks-rules']);
    expect(filterCommunitySkills(list, { lang: 'any' })).toHaveLength(2);
  });

  it('returns [] when nothing matches', () => {
    expect(filterCommunitySkills(list, { q: 'nope' })).toEqual([]);
    expect(filterCommunitySkills(list, { lang: 'cobol' })).toEqual([]);
  });

  it('combines q + lang as AND', () => {
    expect(filterCommunitySkills(list, { q: 'sql', lang: 'any' }).map((s) => s.name)).toEqual(['sql-injection-gate']);
    expect(filterCommunitySkills(list, { q: 'react', lang: 'any' })).toEqual([]); // react is TS-only
  });
});

describe('COMMUNITY_SKILLS fixture', () => {
  it('every entry has a non-empty body', () => {
    expect(COMMUNITY_SKILLS.length).toBeGreaterThanOrEqual(10);
    for (const s of COMMUNITY_SKILLS) {
      expect(s.body.trim().length).toBeGreaterThan(0);
    }
  });

  it('names are unique across the fixture (would-be conflicts at import time)', () => {
    const names = COMMUNITY_SKILLS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
