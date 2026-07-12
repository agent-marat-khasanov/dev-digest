/**
 * context module — pure discovery walker.
 *
 * Walks a repo clone directory (full tree, per request — never cached, AC-7)
 * and collects every `.md` file whose repo-relative path contains one of the
 * configured root folder names as an EXACT, case-sensitive path segment at
 * ANY depth (e.g. `specs/x.md`, `packages/foo/docs/y.md`). Mirrors the style
 * of `repo-intel/pipeline/walk.ts` (excluded dirs, never follow symlinks,
 * skip unreadable dirs) but is a separate, standalone walker — do not modify
 * the repo-intel one.
 *
 * When a path has more than one matching root segment (e.g. a `specs/` dir
 * nested under a `docs/` dir), the FIRST match walking the path left→right
 * wins and decides `folderType`.
 */
import { readdir, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { EXCLUDED_DIRS } from '../repo-intel/constants.js';

const EXCLUDED_SET: ReadonlySet<string> = new Set(EXCLUDED_DIRS);

export interface WalkedDoc {
  /** Repo-relative, posix-separated path (matches `pr_files.path` convention). */
  path: string;
  /** The root segment that matched (drives the `folder_type` badge). */
  folderType: string;
  sizeBytes: number;
  mtime: Date;
}

/**
 * Recursively walk `root`, returning every `.md` file that lives under one of
 * `rootNames` as an exact path segment. Full tree walk pruning only the
 * standard ignored dirs — no top-level-roots shortcut (any-depth matching).
 */
export async function walkContext(root: string, rootNames: string[]): Promise<WalkedDoc[]> {
  const rootSet = new Set(rootNames);
  const out: WalkedDoc[] = [];
  await walkDir(root, root, rootSet, out);
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

async function walkDir(
  root: string,
  dir: string,
  rootSet: Set<string>,
  out: WalkedDoc[],
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
  } catch {
    // Unreadable directory (permissions, dangling symlink) — skip cleanly.
    return;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue; // never follow symlinks (AC-4)
    const name = entry.name;

    if (entry.isDirectory()) {
      if (EXCLUDED_SET.has(name)) continue;
      await walkDir(root, join(dir, name), rootSet, out);
      continue;
    }

    if (!entry.isFile()) continue;
    if (extname(name).toLowerCase() !== '.md') continue;

    const full = join(dir, name);
    const rel = relative(root, full).split(sep).join('/');
    const dirSegments = rel.split('/').slice(0, -1);
    const matched = dirSegments.find((seg) => rootSet.has(seg));
    if (!matched) continue;

    let s;
    try {
      s = await stat(full);
    } catch {
      continue;
    }

    out.push({ path: rel, folderType: matched, sizeBytes: s.size, mtime: s.mtime });
  }
}
