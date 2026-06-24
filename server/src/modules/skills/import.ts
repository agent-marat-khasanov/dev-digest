import { Buffer } from 'node:buffer';
import yauzl from 'yauzl';
import type { SkillImportPreview, SkillType } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';

/**
 * Parse an uploaded skill into a preview payload. Never writes to DB; the
 * client decides whether to save by hitting POST /skills with the parsed
 * payload.
 *
 * Trust model: this runs server-side on bytes the user uploaded. The hardening
 * rules below exist because an imported skill becomes part of an agent's prompt
 * (it is, in effect, another author's instructions running inside the dev's
 * agent), and a zip archive is a known attack surface on top of that:
 *
 *   - size cap (1 MB) and entry cap (32) — bound work for a course starter
 *   - normalised paths only — reject `..`, leading `/`, or absolute paths
 *   - .md extensions only — refuse anything else (no shell, no js, no exe)
 *   - reject entries with the executable bit set in the zip's external attrs
 */

const MAX_ARCHIVE_BYTES = 1 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 32;
const MAX_MARKDOWN_BYTES = 256 * 1024;

const SKILL_TYPES: readonly SkillType[] = ['rubric', 'convention', 'security', 'custom'];

export interface ParsedSkillUpload {
  filename: string;
  bytes: Buffer;
}

export async function parseSkillUpload(upload: ParsedSkillUpload): Promise<SkillImportPreview> {
  const isMarkdown = upload.filename.toLowerCase().endsWith('.md');
  const isZip = upload.filename.toLowerCase().endsWith('.zip');

  if (isMarkdown) return parseMarkdownUpload(upload);
  if (isZip) return parseZipUpload(upload);
  throw new ValidationError(
    `Unsupported file type: ${upload.filename}. Upload a .md file or a .zip archive.`,
  );
}

// ---------------------------------------------------------------------------
// Markdown — single file with optional YAML frontmatter.
// ---------------------------------------------------------------------------

function parseMarkdownUpload(upload: ParsedSkillUpload): SkillImportPreview {
  if (upload.bytes.byteLength > MAX_MARKDOWN_BYTES) {
    throw new ValidationError(
      `Markdown skill exceeds ${MAX_MARKDOWN_BYTES} bytes (got ${upload.bytes.byteLength}).`,
    );
  }
  const text = upload.bytes.toString('utf8');
  const { frontmatter, body } = splitFrontmatter(text);
  const warnings: string[] = [];

  const name = pickString(frontmatter, 'name') ?? stripMdExtension(upload.filename);
  const description = pickString(frontmatter, 'description') ?? '';
  if (!description) warnings.push('No description in frontmatter — left empty for the user to fill in.');

  const type = coerceSkillType(pickString(frontmatter, 'type'), warnings);

  return {
    parsed: { name, description, type, body, evidence_files: null },
    format: 'markdown',
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Zip — SKILL.md + any number of sibling .md reference files. NOTHING else.
// ---------------------------------------------------------------------------

interface ZipEntry {
  path: string;
  content: Buffer;
}

async function parseZipUpload(upload: ParsedSkillUpload): Promise<SkillImportPreview> {
  if (upload.bytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new ValidationError(
      `Archive exceeds ${MAX_ARCHIVE_BYTES} bytes (got ${upload.bytes.byteLength}).`,
    );
  }

  const { kept, rejected } = await readZipEntries(upload.bytes);

  const skillMd = kept.find((e) => isSkillManifest(e.path));
  if (!skillMd) {
    throw new ValidationError(
      'Archive does not contain SKILL.md at the root (or inside a single top-level folder).',
    );
  }

  const text = skillMd.content.toString('utf8');
  const { frontmatter, body } = splitFrontmatter(text);
  const warnings: string[] = rejected.map((r) => `Rejected ${r.path}: ${r.reason}`);

  const name = pickString(frontmatter, 'name') ?? stripMdExtension(basename(skillMd.path));
  const description = pickString(frontmatter, 'description') ?? '';
  if (!description) warnings.push('No description in frontmatter — left empty for the user to fill in.');

  const type = coerceSkillType(pickString(frontmatter, 'type'), warnings);

  const evidence = kept
    .filter((e) => e !== skillMd)
    .map((e) => basename(e.path))
    .sort();

  return {
    parsed: {
      name,
      description,
      type,
      body,
      evidence_files: evidence.length > 0 ? evidence : null,
    },
    format: 'archive',
    warnings,
  };
}

interface ZipReadResult {
  kept: ZipEntry[];
  rejected: Array<{ path: string; reason: string }>;
}

function readZipEntries(bytes: Buffer): Promise<ZipReadResult> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) {
        reject(new ValidationError(`Invalid zip archive: ${err?.message ?? 'unknown error'}`));
        return;
      }

      const kept: ZipEntry[] = [];
      const rejected: Array<{ path: string; reason: string }> = [];
      let seen = 0;

      zip.on('entry', (entry: yauzl.Entry) => {
        seen += 1;
        if (seen > MAX_ARCHIVE_ENTRIES) {
          rejected.push({ path: entry.fileName, reason: 'archive entry cap exceeded' });
          zip.readEntry();
          return;
        }

        const reason = entryRejectionReason(entry);
        if (reason) {
          rejected.push({ path: entry.fileName, reason });
          zip.readEntry();
          return;
        }

        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) {
            rejected.push({ path: entry.fileName, reason: 'unreadable' });
            zip.readEntry();
            return;
          }
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => {
            kept.push({ path: entry.fileName, content: Buffer.concat(chunks) });
            zip.readEntry();
          });
          stream.on('error', () => {
            rejected.push({ path: entry.fileName, reason: 'stream error' });
            zip.readEntry();
          });
        });
      });

      zip.on('end', () => resolve({ kept, rejected }));
      zip.on('error', (e) => reject(new ValidationError(`Zip error: ${e.message}`)));
      zip.readEntry();
    });
  });
}

/**
 * The zip entry hardening rule, exposed so tests can exercise it without
 * having to forge a malicious archive (yazl refuses to write `..` paths).
 * The function only reads `fileName` + `externalFileAttributes` from the
 * yauzl entry, so a partial object is enough at the test boundary.
 */
export function entryRejectionReason(
  entry: Pick<yauzl.Entry, 'fileName' | 'externalFileAttributes'>,
): string | null {
  const name = entry.fileName;
  if (name.endsWith('/')) return 'directory entry';
  const normalised = name.replace(/\\/g, '/');
  if (normalised.startsWith('/')) return 'absolute path';
  if (normalised.split('/').some((p) => p === '..' || p === '')) return 'path traversal';
  if (!normalised.toLowerCase().endsWith('.md')) return 'non-.md extension';
  // Unix executable bit lives in the upper 16 of externalFileAttributes.
  const unixMode = (entry.externalFileAttributes >>> 16) & 0o777;
  if (unixMode & 0o111) return 'executable bit set';
  return null;
}

function isSkillManifest(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower === 'skill.md') return true;
  // Allow a single top-level folder (e.g. `my-skill/SKILL.md`) — common when
  // a user zips the folder rather than its contents.
  return /^[^/]+\/skill\.md$/.test(lower);
}

function basename(path: string): string {
  const ix = path.lastIndexOf('/');
  return ix < 0 ? path : path.slice(ix + 1);
}

function stripMdExtension(name: string): string {
  return name.replace(/\.md$/i, '');
}

// ---------------------------------------------------------------------------
// Frontmatter — minimal YAML subset: `key: value` lines between `---` fences.
// We intentionally do NOT pull in a YAML parser; the surface is tiny and we
// only consume three keys.
// ---------------------------------------------------------------------------

function splitFrontmatter(text: string): { frontmatter: Record<string, string>; body: string } {
  if (!text.startsWith('---')) return { frontmatter: {}, body: text };
  const closing = text.indexOf('\n---', 3);
  if (closing < 0) return { frontmatter: {}, body: text };
  const block = text.slice(3, closing).replace(/^\r?\n/, '');
  const after = text.slice(closing + 4).replace(/^\r?\n/, '');
  const frontmatter: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colon = trimmed.indexOf(':');
    if (colon < 0) continue;
    const key = trimmed.slice(0, colon).trim();
    const raw = trimmed.slice(colon + 1).trim();
    frontmatter[key] = stripQuotes(raw);
  }
  return { frontmatter, body: after };
}

function stripQuotes(s: string): string {
  if (s.length >= 2 && ((s[0] === '"' && s.at(-1) === '"') || (s[0] === "'" && s.at(-1) === "'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function pickString(map: Record<string, string>, key: string): string | undefined {
  const v = map[key];
  return v && v.length > 0 ? v : undefined;
}

function coerceSkillType(value: string | undefined, warnings: string[]): SkillType {
  if (value && (SKILL_TYPES as readonly string[]).includes(value)) return value as SkillType;
  if (value) warnings.push(`Unknown skill type "${value}" — defaulted to "custom".`);
  return 'custom';
}
