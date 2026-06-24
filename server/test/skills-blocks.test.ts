import { describe, expect, it } from 'vitest';
import { selectActiveSkillBlocks } from '../src/modules/reviews/skill-blocks.js';

/** A tiny tokeniser stand-in: tokens = words. Lets us assert per-block math
 *  without pulling tiktoken into the unit test. */
const wordTokens = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

const link = (
  id: string,
  name: string,
  body: string,
  skillEnabled: boolean,
  linkEnabled: boolean,
) => ({
  skill: { id, name, body, enabled: skillEnabled },
  enabled: linkEnabled,
});

describe('selectActiveSkillBlocks', () => {
  it('returns an entry per active link, in order, with per-skill token counts', () => {
    const out = selectActiveSkillBlocks(
      [
        link('a', 'first', 'one two three', true, true),
        link('b', 'second', 'word word word word', true, true),
      ],
      wordTokens,
    );
    expect(out).toEqual([
      { id: 'a', name: 'first', body: 'one two three', tokens: 3 },
      { id: 'b', name: 'second', body: 'word word word word', tokens: 4 },
    ]);
  });

  it('drops a link when the skill is globally disabled', () => {
    const out = selectActiveSkillBlocks(
      [
        link('a', 'globally-off', 'body', false, true),
        link('b', 'on', 'body', true, true),
      ],
      wordTokens,
    );
    expect(out.map((b) => b.id)).toEqual(['b']);
  });

  it('drops a link when the per-agent toggle is off (even if the skill itself is on)', () => {
    const out = selectActiveSkillBlocks(
      [
        link('a', 'link-off', 'body', true, false),
        link('b', 'on', 'body', true, true),
      ],
      wordTokens,
    );
    expect(out.map((b) => b.id)).toEqual(['b']);
  });

  it('returns [] when nothing passes both gates', () => {
    const out = selectActiveSkillBlocks(
      [
        link('a', 'x', 'b', false, true),
        link('b', 'y', 'b', true, false),
      ],
      wordTokens,
    );
    expect(out).toEqual([]);
  });

  it('preserves the input order (no re-sort)', () => {
    const out = selectActiveSkillBlocks(
      [
        link('z', 'first-z', 'b', true, true),
        link('a', 'second-a', 'b', true, true),
        link('m', 'third-m', 'b', true, true),
      ],
      wordTokens,
    );
    expect(out.map((b) => b.id)).toEqual(['z', 'a', 'm']);
  });

  it('calls the tokeniser exactly once per active skill', () => {
    let calls = 0;
    const counter = (t: string) => {
      calls++;
      return wordTokens(t);
    };
    selectActiveSkillBlocks(
      [
        link('a', 'x', 'one two', true, true),
        link('b', 'y', 'skipped', true, false), // filtered out → no tokeniser call
        link('c', 'z', 'three four five', true, true),
      ],
      counter,
    );
    expect(calls).toBe(2);
  });
});
