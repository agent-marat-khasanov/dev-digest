import { readFile, stat } from 'node:fs/promises';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveInClone } from '../../platform/fs-guard.js';
import { MAX_FILE_SIZE } from '../repo-intel/constants.js';
import type { DegradedReason, IndexStatus, ReachableFacts } from '../repo-intel/types.js';

/**
 * Deterministic, model-free inputs for the onboarding tour (AC-1). Everything
 * here comes from the `repoIntel` facade (rank-driven reads, all degraded-safe)
 * plus a guarded read of the clone's `package.json` for run commands (AC-8) —
 * the facade exposes no scripts/setup method (see plan Risk 1).
 */
export interface TourFacts {
  repoId: string;
  /** Reading-path order — pure PageRank rank DESC, no hotness (AC-2/AC-3). */
  topFiles: string[];
  /** Dependency chains from the highest-ranked roots (AC-4). */
  criticalPaths: string[][];
  /** Routes/crons reachable from each seed file — folded into `architecture` (NG6). */
  reachableFacts: Record<string, ReachableFacts>;
  /** Fixed-token-budget repo skeleton text (AC-13). */
  repoMap: string;
  /** Code-derived run commands from the clone's manifest — never model-authored (AC-8). */
  commands: string[];
  /** Union of every real path surfaced in the facts — the AC-7 validation set. */
  allowedPaths: Set<string>;
  filesIndexed: number;
  indexedSha: string | null;
  indexStatus: IndexStatus;
  degraded: boolean;
  degradedReason?: DegradedReason;
}

/** How many top-ranked files seed the reading path / critical-path context. */
const TOP_FILES_COUNT = 15;

const SETUP_SCRIPT_PRIORITY = ['dev', 'start', 'build', 'test'] as const;

/**
 * Gathers every deterministic fact the onboarding tour needs — zero model
 * calls (AC-1). Relies entirely on the facade's own fixed read budgets
 * (`getTopFilesByRank`/`getRepoMap`), so there is no generator-specific size
 * threshold here (AC-13/NG2).
 */
export async function gatherFacts(
  container: Container,
  workspaceId: string,
  repoId: string,
): Promise<TourFacts> {
  const repo = await container.repoRepo.getById(workspaceId, repoId);
  if (!repo) throw new NotFoundError('Repo not found');

  const indexState = await container.repoIntel.getIndexState(repoId);

  const [topFiles, criticalPaths, repoMapResult] = await Promise.all([
    container.repoIntel.getTopFilesByRank(repoId, TOP_FILES_COUNT),
    container.repoIntel.getCriticalPaths(repoId),
    container.repoIntel.getRepoMap(repoId),
  ]);

  const criticalPathFiles = [...new Set(criticalPaths.flat())];
  const reachableSeeds = [...new Set([...topFiles, ...criticalPathFiles])];
  const reachableFacts = await container.repoIntel.getReachableFacts(repoId, reachableSeeds);

  const allowedPaths = new Set<string>();
  for (const f of topFiles) allowedPaths.add(f);
  for (const f of criticalPathFiles) allowedPaths.add(f);
  for (const seed of Object.keys(reachableFacts)) allowedPaths.add(seed);

  const commands = repo.clonePath ? await deriveCommands(repo.clonePath) : [];

  return {
    repoId,
    topFiles,
    criticalPaths,
    reachableFacts,
    repoMap: repoMapResult.text,
    commands,
    allowedPaths,
    filesIndexed: indexState.filesIndexed,
    indexedSha: indexState.lastIndexedSha || null,
    indexStatus: indexState.status,
    degraded: indexState.degraded ?? false,
    degradedReason: indexState.degradedReason,
  };
}

interface PackageManifest {
  scripts?: Record<string, string>;
}

/** Reads a repo-relative file from the clone, guarded + size-capped, or null. */
async function readClonedFile(clonePath: string, relPath: string): Promise<string | null> {
  const full = resolveInClone(clonePath, relPath);
  if (!full) return null;
  let size: number;
  try {
    size = (await stat(full)).size;
  } catch {
    return null;
  }
  if (size > MAX_FILE_SIZE) return null;
  return readFile(full, 'utf8').catch(() => null);
}

async function detectPackageManager(clonePath: string): Promise<'pnpm' | 'yarn' | 'npm'> {
  if ((await readClonedFile(clonePath, 'pnpm-lock.yaml')) !== null) return 'pnpm';
  if ((await readClonedFile(clonePath, 'yarn.lock')) !== null) return 'yarn';
  return 'npm';
}

/** Derives copy-only run commands from the clone's real `package.json` scripts (AC-8). */
async function deriveCommands(clonePath: string): Promise<string[]> {
  const raw = await readClonedFile(clonePath, 'package.json');
  if (raw === null) return [];

  let pkg: PackageManifest;
  try {
    pkg = JSON.parse(raw) as PackageManifest;
  } catch {
    return [];
  }

  const packageManager = await detectPackageManager(clonePath);
  const scripts = pkg.scripts ?? {};
  const commands: string[] = [`${packageManager} install`];
  for (const name of SETUP_SCRIPT_PRIORITY) {
    if (typeof scripts[name] === 'string') commands.push(`${packageManager} run ${name}`);
  }
  return commands;
}
