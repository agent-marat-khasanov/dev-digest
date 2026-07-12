import { describe, it, expect } from 'vitest';
import { orderContextPaths } from './context-blocks.js';

describe('orderContextPaths', () => {
  it('orders agent docs first, then skill-inherited docs', () => {
    const result = orderContextPaths(['specs/a.md', 'docs/b.md'], ['insights/c.md']);
    expect(result).toEqual(['specs/a.md', 'docs/b.md', 'insights/c.md']);
  });

  it('dedupes by path keeping the FIRST occurrence (agent-level wins its position)', () => {
    const result = orderContextPaths(['specs/a.md'], ['specs/a.md', 'docs/b.md']);
    expect(result).toEqual(['specs/a.md', 'docs/b.md']);
  });

  it('dedupes duplicates within the skill-inherited list too', () => {
    const result = orderContextPaths([], ['docs/b.md', 'docs/b.md']);
    expect(result).toEqual(['docs/b.md']);
  });

  it('returns [] when both lists are empty', () => {
    expect(orderContextPaths([], [])).toEqual([]);
  });

  it('returns only agent docs when nothing is inherited', () => {
    expect(orderContextPaths(['specs/a.md'], [])).toEqual(['specs/a.md']);
  });

  it('returns only inherited docs when the agent has none attached', () => {
    expect(orderContextPaths([], ['insights/c.md'])).toEqual(['insights/c.md']);
  });
});
