import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walkContext } from './walk.js';

const ROOTS = ['specs', 'docs', 'insights'];

describe('walkContext', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'context-walk-'));

    // Top-level match at depth 1.
    await mkdir(join(root, 'specs'), { recursive: true });
    await writeFile(join(root, 'specs', 'api.md'), '# API spec');

    // Any-depth nested match, e.g. packages/*/docs/**.
    await mkdir(join(root, 'packages', 'foo', 'docs', 'sub'), { recursive: true });
    await writeFile(join(root, 'packages', 'foo', 'docs', 'sub', 'guide.md'), '# Guide');

    // A first-match-wins case: a `specs` dir nested under an already-matched `docs` dir.
    await mkdir(join(root, 'docs', 'specs'), { recursive: true });
    await writeFile(join(root, 'docs', 'specs', 'nested.md'), '# Nested');

    // Non-.md file under a matched root — ignored.
    await writeFile(join(root, 'specs', 'notes.txt'), 'not markdown');

    // Ignored dirs, even nested under a matched root name.
    await mkdir(join(root, 'specs', 'node_modules', 'docs'), { recursive: true });
    await writeFile(join(root, 'specs', 'node_modules', 'docs', 'skip.md'), '# skip');
    await mkdir(join(root, 'node_modules', 'specs'), { recursive: true });
    await writeFile(join(root, 'node_modules', 'specs', 'skip2.md'), '# skip2');

    // Case sensitivity: "Specs" must NOT match the "specs" root.
    await mkdir(join(root, 'Specs'), { recursive: true });
    await writeFile(join(root, 'Specs', 'case.md'), '# case');

    // No matching root — ignored.
    await mkdir(join(root, 'random'), { recursive: true });
    await writeFile(join(root, 'random', 'readme.md'), '# random');

    // Symlinked directory pointing at a real matched-root dir — must not be followed.
    await mkdir(join(root, 'real', 'specs'), { recursive: true });
    await writeFile(join(root, 'real', 'specs', 'linked.md'), '# linked');
    await symlink(join(root, 'real'), join(root, 'linked-real'), 'dir').catch(() => {});
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('matches a root segment at depth 1 and any nested depth (first match wins left-to-right)', async () => {
    const docs = await walkContext(root, ROOTS);
    const paths = docs.map((d) => d.path).sort();
    expect(paths).toContain('specs/api.md');
    expect(paths).toContain('packages/foo/docs/sub/guide.md');
    // docs/specs/nested.md: "docs" is the first matching segment left-to-right.
    const nested = docs.find((d) => d.path === 'docs/specs/nested.md');
    expect(nested?.folderType).toBe('docs');
  });

  it('excludes non-.md files', async () => {
    const docs = await walkContext(root, ROOTS);
    expect(docs.some((d) => d.path.endsWith('notes.txt'))).toBe(false);
  });

  it('excludes standard ignored directories even nested under a matched root', async () => {
    const docs = await walkContext(root, ROOTS);
    expect(docs.some((d) => d.path.includes('node_modules'))).toBe(false);
  });

  it('matches root names as exact, case-sensitive segments', async () => {
    const docs = await walkContext(root, ROOTS);
    expect(docs.some((d) => d.path.startsWith('Specs/'))).toBe(false);
  });

  it('ignores directories with no matching root segment', async () => {
    const docs = await walkContext(root, ROOTS);
    expect(docs.some((d) => d.path.startsWith('random/'))).toBe(false);
  });

  it('does not follow symlinked directories', async () => {
    const docs = await walkContext(root, ROOTS);
    expect(docs.some((d) => d.path.startsWith('linked-real/'))).toBe(false);
    // The real target IS still walked directly (not excluded, just not via the symlink).
    expect(docs.some((d) => d.path === 'real/specs/linked.md')).toBe(true);
  });

  it('returns each doc with folderType, sizeBytes, and mtime', async () => {
    const docs = await walkContext(root, ROOTS);
    const doc = docs.find((d) => d.path === 'specs/api.md');
    expect(doc).toMatchObject({ path: 'specs/api.md', folderType: 'specs' });
    expect(doc!.sizeBytes).toBeGreaterThan(0);
    expect(doc!.mtime).toBeInstanceOf(Date);
  });

  it('respects a custom (overridden) root list', async () => {
    const docs = await walkContext(root, ['random']);
    const paths = docs.map((d) => d.path);
    expect(paths).toEqual(['random/readme.md']);
  });
});
