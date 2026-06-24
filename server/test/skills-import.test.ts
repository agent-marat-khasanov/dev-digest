import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import yazl from 'yazl';
import { entryRejectionReason, parseSkillUpload } from '../src/modules/skills/import.js';
import { ValidationError } from '../src/platform/errors.js';

/**
 * Pure tests for the skill import parser. No DB, no I/O — just bytes in, a
 * SkillImportPreview out (or a ValidationError). Focuses on the hardening
 * paths that defend against a hostile archive becoming part of an agent's
 * prompt: path traversal, executable bit, extension allow-list, size caps,
 * missing manifest.
 */

const MD = (body = 'Body line.\nSecond line.') => Buffer.from(body, 'utf8');

const MD_WITH_FM = (frontmatter: string, body = '# Skill\nDo the thing.') =>
  Buffer.from(`---\n${frontmatter}\n---\n${body}\n`, 'utf8');

/** Build an in-memory zip from `entries` so tests don't depend on disk fixtures. */
async function buildZip(
  entries: Array<{ path: string; content: string | Buffer; unixMode?: number }>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const z = new yazl.ZipFile();
    for (const e of entries) {
      const buf = typeof e.content === 'string' ? Buffer.from(e.content, 'utf8') : e.content;
      z.addBuffer(buf, e.path, e.unixMode !== undefined ? { mode: e.unixMode } : {});
    }
    z.end();
    const chunks: Buffer[] = [];
    z.outputStream.on('data', (c: Buffer) => chunks.push(c));
    z.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    z.outputStream.on('error', reject);
  });
}

describe('parseSkillUpload — markdown path', () => {
  it('parses plain markdown without frontmatter', async () => {
    const r = await parseSkillUpload({ filename: 'my-skill.md', bytes: MD('# Title\n\nbody') });
    expect(r.format).toBe('markdown');
    expect(r.parsed.name).toBe('my-skill');
    expect(r.parsed.type).toBe('custom');
    expect(r.parsed.body).toContain('# Title');
    // No frontmatter → no description; surfaces as a warning.
    expect(r.warnings.some((w) => /description/i.test(w))).toBe(true);
  });

  it('lifts name/type/description from YAML frontmatter', async () => {
    const r = await parseSkillUpload({
      filename: 'whatever.md',
      bytes: MD_WITH_FM('name: secret-leakage-gate\ntype: security\ndescription: "Block hardcoded secrets"'),
    });
    expect(r.parsed.name).toBe('secret-leakage-gate');
    expect(r.parsed.type).toBe('security');
    expect(r.parsed.description).toBe('Block hardcoded secrets');
    // Body starts AFTER the closing fence.
    expect(r.parsed.body.startsWith('# Skill')).toBe(true);
    expect(r.warnings).toHaveLength(0);
  });

  it('defaults unknown type to custom AND warns about it', async () => {
    const r = await parseSkillUpload({
      filename: 'x.md',
      bytes: MD_WITH_FM('name: x\ntype: rocket-science\ndescription: d'),
    });
    expect(r.parsed.type).toBe('custom');
    expect(r.warnings.some((w) => /rocket-science/.test(w))).toBe(true);
  });

  it('rejects markdown that exceeds the 256 KiB cap', async () => {
    const big = Buffer.alloc(257 * 1024, 'x');
    await expect(parseSkillUpload({ filename: 'big.md', bytes: big })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('rejects an unsupported extension', async () => {
    await expect(
      parseSkillUpload({ filename: 'skill.sh', bytes: Buffer.from('echo pwn', 'utf8') }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('parseSkillUpload — zip path', () => {
  it('extracts SKILL.md at the archive root + treats sibling .md as evidence files', async () => {
    const zip = await buildZip([
      { path: 'SKILL.md', content: '---\nname: zipped\ntype: convention\ndescription: D\n---\nbody here' },
      { path: 'ref.md', content: '# notes' },
      { path: 'examples.md', content: '# more notes' },
    ]);
    const r = await parseSkillUpload({ filename: 'a.zip', bytes: zip });
    expect(r.format).toBe('archive');
    expect(r.parsed.name).toBe('zipped');
    expect(r.parsed.type).toBe('convention');
    expect(r.parsed.description).toBe('D');
    expect(r.parsed.body).toBe('body here');
    expect(r.parsed.evidence_files).toEqual(['examples.md', 'ref.md']);
    expect(r.warnings).toHaveLength(0);
  });

  it('supports a single top-level folder containing SKILL.md', async () => {
    const zip = await buildZip([
      { path: 'my-skill/SKILL.md', content: 'just a body' },
      { path: 'my-skill/extra.md', content: 'side doc' },
    ]);
    const r = await parseSkillUpload({ filename: 'a.zip', bytes: zip });
    expect(r.parsed.body).toBe('just a body');
    expect(r.parsed.evidence_files).toEqual(['extra.md']);
  });

  it('rejects entries with a non-.md extension and surfaces them as warnings', async () => {
    const zip = await buildZip([
      { path: 'SKILL.md', content: 'body' },
      { path: 'evil.sh', content: 'echo pwn' },
      { path: 'binary.exe', content: '\x00\x01\x02' },
    ]);
    const r = await parseSkillUpload({ filename: 'a.zip', bytes: zip });
    expect(r.parsed.evidence_files).toBeNull();
    expect(r.warnings.some((w) => /evil\.sh/.test(w))).toBe(true);
    expect(r.warnings.some((w) => /binary\.exe/.test(w))).toBe(true);
  });

  it('rejects entries with the unix executable bit set, even when extension is .md', async () => {
    const zip = await buildZip([
      { path: 'SKILL.md', content: 'body' },
      { path: 'sneaky.md', content: 'looks harmless', unixMode: 0o100755 },
    ]);
    const r = await parseSkillUpload({ filename: 'a.zip', bytes: zip });
    expect(r.parsed.evidence_files).toBeNull();
    expect(r.warnings.some((w) => /sneaky\.md/.test(w) && /executable/i.test(w))).toBe(true);
  });

  it('throws when no SKILL.md is present in the archive', async () => {
    const zip = await buildZip([
      { path: 'README.md', content: 'no manifest' },
      { path: 'rules.md', content: 'rules' },
    ]);
    await expect(parseSkillUpload({ filename: 'a.zip', bytes: zip })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('throws when the archive exceeds the 1 MiB cap', async () => {
    const huge = Buffer.alloc(2 * 1024 * 1024, 0xff);
    await expect(parseSkillUpload({ filename: 'huge.zip', bytes: huge })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  // yazl refuses to write `..` / leading-/ paths, so the hardening rule is
  // exercised directly on its pure predicate (the same one used at zip-read time).
  it.each([
    { path: '../escape.md', expected: 'path traversal' },
    { path: 'a/../b.md', expected: 'path traversal' },
    { path: '/etc/passwd.md', expected: 'absolute path' },
    { path: 'sub/', expected: 'directory entry' },
    { path: 'sneaky.sh', expected: 'non-.md extension' },
    { path: 'README', expected: 'non-.md extension' },
  ])('entryRejectionReason("$path") → "$expected"', ({ path, expected }) => {
    expect(entryRejectionReason({ fileName: path, externalFileAttributes: 0 })).toBe(expected);
  });

  it('entryRejectionReason flags the unix exec bit', () => {
    expect(
      entryRejectionReason({ fileName: 'fine.md', externalFileAttributes: 0o100755 << 16 }),
    ).toBe('executable bit set');
  });

  it('entryRejectionReason returns null for a plain .md file', () => {
    expect(entryRejectionReason({ fileName: 'fine.md', externalFileAttributes: 0o100644 << 16 })).toBeNull();
  });

  it('caps the entry count by rejecting entries past the limit', async () => {
    const entries = [{ path: 'SKILL.md', content: 'body' }];
    // 33 sibling refs — only the first 31 fit under the 32-entry cap (SKILL.md is #1).
    for (let i = 0; i < 33; i++) entries.push({ path: `ref-${i}.md`, content: 'x' });
    const zip = await buildZip(entries);
    const r = await parseSkillUpload({ filename: 'a.zip', bytes: zip });
    expect(r.warnings.some((w) => /entry cap/i.test(w))).toBe(true);
    // At most 31 evidence files survive the cap.
    expect((r.parsed.evidence_files ?? []).length).toBeLessThanOrEqual(31);
  });
});
