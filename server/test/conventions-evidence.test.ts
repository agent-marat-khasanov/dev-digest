import { describe, it, expect } from 'vitest';
import { evidenceMatches } from '../src/modules/conventions/helpers.js';

/**
 * Unit coverage for the code-based evidence check that gates every extracted
 * convention. A candidate survives only if its cited code actually appears in
 * the file — exact line, or anywhere in the file as a fallback for line drift.
 */

const FILE = [
  'import { readFile } from "node:fs/promises";', // line 1
  '',
  'export async function load(p: string) {', // line 3
  '  return await readFile(p, "utf8");', // line 4
  '}',
].join('\n');

describe('evidenceMatches', () => {
  it('rejects when the file does not exist (null content)', () => {
    expect(evidenceMatches(null, '4', 'return await readFile(p, "utf8");')).toBe(false);
  });

  it('rejects empty code snippets', () => {
    expect(evidenceMatches(FILE, '4', '')).toBe(false);
    expect(evidenceMatches(FILE, '4', '   ')).toBe(false);
  });

  it('matches code on the exact cited line', () => {
    expect(evidenceMatches(FILE, '4', 'return await readFile(p, "utf8");')).toBe(true);
  });

  it('ignores cosmetic whitespace differences', () => {
    expect(evidenceMatches(FILE, '4', 'return   await    readFile(p,  "utf8");')).toBe(true);
  });

  it('falls back to whole-file match when the line number drifted', () => {
    // Cite line 2 (blank) but the code lives on line 4 — still accepted.
    expect(evidenceMatches(FILE, '2', 'await readFile(p, "utf8")')).toBe(true);
  });

  it('handles a non-numeric line via the whole-file fallback', () => {
    expect(evidenceMatches(FILE, 'L4', 'export async function load')).toBe(true);
  });

  it('rejects code that is nowhere in the file', () => {
    expect(evidenceMatches(FILE, '4', 'console.log("never written")')).toBe(false);
  });
});
