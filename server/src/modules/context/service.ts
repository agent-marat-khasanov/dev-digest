import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type {
  AgentContextLink,
  ContextDoc,
  ContextFolderType,
  ContextPreview,
  SkillContextLink,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { MAX_FILE_SIZE } from '../repo-intel/constants.js';
import { RepoRepository } from '../repos/repository.js';
import { SkillsRepository } from '../skills/repository.js';
import type { ContextLinkInput } from './repository.js';
import { walkContext } from './walk.js';

/**
 * context module service. Discovery (list/preview) is a fresh, uncached walk
 * of the repo clone per request (AC-7) — nothing about the doc list is
 * persisted. Only ORDERED PATHS are ever stored (agent_context/skill_context),
 * never doc text (AC-17). Every repo/agent/skill lookup is workspace-scoped
 * (AC-29, IDOR-safe).
 */
export class ContextService {
  private repos: RepoRepository;
  private skills: SkillsRepository;

  constructor(private container: Container) {
    this.repos = new RepoRepository(container.db);
    this.skills = new SkillsRepository(container.db);
  }

  private get links() {
    return this.container.contextRepo;
  }

  /**
   * Fresh discovery walk for a repo. AC-5: a repo that was never cloned
   * returns a deterministic empty list (never a 500) — the client already
   * knows the repo's clone status from `Repo.clone_path`.
   */
  async list(workspaceId: string, repoId: string): Promise<ContextDoc[]> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    if (!repo.clonePath) return [];

    const clonePath = repo.clonePath;
    const docs = await walkContext(clonePath, this.container.config.contextRoots);
    const out: ContextDoc[] = [];
    for (const doc of docs) {
      const full = resolveInClone(clonePath, doc.path);
      const content = full ? await readFile(full, 'utf8').catch(() => null) : null;
      out.push({
        path: doc.path,
        // The walker only matches names drawn from `contextRoots`; the
        // default config is exactly the enum's members.
        folder_type: doc.folderType as ContextFolderType,
        size_bytes: doc.sizeBytes,
        tokens: content !== null ? this.container.tokenizer.count(content) : 0,
        updated_at: doc.mtime.toISOString(),
      });
    }
    return out;
  }

  /** On-demand read-only preview of one doc, guarded against path traversal. */
  async preview(workspaceId: string, repoId: string, relPath: string): Promise<ContextPreview> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    if (!repo.clonePath) throw new NotFoundError('Repo has no local clone yet');

    const full = resolveInClone(repo.clonePath, relPath);
    if (!full) throw new ValidationError('Path resolves outside the repo clone');

    let size: number;
    try {
      size = (await stat(full)).size;
    } catch {
      throw new NotFoundError('Doc not found');
    }
    if (size > MAX_FILE_SIZE) {
      throw new ValidationError('Doc exceeds the preview size cap');
    }

    const content = await readFile(full, 'utf8').catch(() => null);
    if (content === null) throw new NotFoundError('Doc not found');
    return { path: relPath, content };
  }

  // ---- agent context links ------------------------------------------------

  async getAgentContext(workspaceId: string, agentId: string): Promise<AgentContextLink[] | undefined> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const rows = await this.links.listAgentContext(agentId);
    return rows.map((r) => ({ agent_id: r.agentId, path: r.path, order: r.order }));
  }

  async setAgentContext(
    workspaceId: string,
    agentId: string,
    docs: ContextLinkInput[],
  ): Promise<AgentContextLink[] | undefined> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    assertSafePaths(docs);
    await this.links.setAgentContext(agentId, docs);
    return this.getAgentContext(workspaceId, agentId);
  }

  // ---- skill context links ------------------------------------------------

  async getSkillContext(workspaceId: string, skillId: string): Promise<SkillContextLink[] | undefined> {
    const skill = await this.skills.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.links.listSkillContext(skillId);
    return rows.map((r) => ({ skill_id: r.skillId, path: r.path, order: r.order }));
  }

  async setSkillContext(
    workspaceId: string,
    skillId: string,
    docs: ContextLinkInput[],
  ): Promise<SkillContextLink[] | undefined> {
    const skill = await this.skills.getById(workspaceId, skillId);
    if (!skill) return undefined;
    assertSafePaths(docs);
    await this.links.setSkillContext(skillId, docs);
    return this.getSkillContext(workspaceId, skillId);
  }
}

/**
 * Resolve a repo-relative path against a clone root, rejecting traversal
 * (absolute paths, `..`) — `resolve(root, rel)` must stay under
 * `resolve(root)` (== root or start with `root + sep`). Mirrors
 * `conventions/service.ts`'s guarded read; NOT `readClone` (no guard there).
 *
 * Exported for reuse by `reviews/run-executor.ts` (T6 run-time doc injection)
 * so the guard is defined exactly once.
 */
export function resolveInClone(clonePath: string, rel: string): string | null {
  const root = resolve(clonePath);
  const full = resolve(root, rel);
  if (full !== root && !full.startsWith(root + sep)) return null;
  return full;
}

/**
 * Attach-time guard (AC-27): agents/skills are not repo-scoped, so there is
 * no single clone to resolve against here — reject any path that is absolute
 * or escapes its own root via `..` using the same stay-under-root check
 * against a virtual root (purely syntactic; symlink-escape can only be
 * detected once a real clone is read, which the run-time path — T6 — and the
 * preview endpoint above both guard for real).
 */
function assertSafePaths(docs: ContextLinkInput[]): void {
  for (const doc of docs) {
    if (!resolveInClone('/__context_attach_root__', doc.path)) {
      throw new ValidationError(`Path resolves outside the repo clone: ${doc.path}`);
    }
  }
}
