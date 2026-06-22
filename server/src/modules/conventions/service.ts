import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import {
  ConventionExtraction,
  type Convention,
  type ConventionStatus,
  type CreateSkillFromConventionsInput,
  type ExtractConventionsResult,
  type ExtractedCandidate,
  type Skill,
  type UpdateConventionInput,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { SkillsService } from '../skills/service.js';
import { ConventionsRepository, type InsertConvention } from './repository.js';
import { toConventionDto, evidenceMatches } from './helpers.js';
import { ANALYST_PROMPT, CONFIG_FILE_CANDIDATES } from './prompt.js';

const SAMPLE_FILE_COUNT = 12;
const MAX_CONTEXT_CHARS = 60_000;
const MAX_FILE_CHARS = 8_000;

/**
 * Conventions service. Orchestrates the extract pipeline:
 *   collect samples (no model) → analyst model (forced tool-use) →
 *   code-based evidence validation (no model) → persist as `pending`.
 * Plus CRUD and "bake accepted conventions into a Skill".
 */
export class ConventionsService {
  private repo: ConventionsRepository;
  private skills: SkillsService;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
    this.skills = new SkillsService(container);
  }

  async listByRepo(
    workspaceId: string,
    repoId: string,
    status?: ConventionStatus,
  ): Promise<Convention[]> {
    const rows = await this.repo.listByRepo(workspaceId, repoId, status);
    return rows.map(toConventionDto);
  }

  async extract(workspaceId: string, repoId: string): Promise<ExtractConventionsResult> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    if (!repo.clonePath) {
      throw new ValidationError('Repo has no local clone yet — clone/index it before extracting conventions.');
    }

    // Step 1 — collect config + representative source samples (no model).
    const samplePaths = await this.container.repoIntel.getConventionSamples(
      repoId,
      SAMPLE_FILE_COUNT,
    );
    const context = await this.buildContext(repo.clonePath, samplePaths);
    if (context.trim().length === 0) {
      throw new ValidationError('No source files available to analyze — index the repo first.');
    }

    // Step 2 — analyst model via forced tool-use (validated, no manual parse).
    const choice = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await this.container.llm(choice.provider);
    const result = await llm.completeStructured({
      model: choice.model,
      schema: ConventionExtraction,
      schemaName: 'ConventionExtraction',
      messages: [
        { role: 'system', content: ANALYST_PROMPT },
        { role: 'user', content: context },
      ],
      maxTokens: 4096,
    });

    // Step 3 — code-based evidence validation (no model). Discard any candidate
    // whose cited file is missing or whose code does not appear in it.
    const validated = await this.validate(repo.clonePath, result.data.conventions);

    // Step 4 — replace the repo's conventions with the fresh pending set.
    const rows = await this.repo.replaceForRepo(workspaceId, repoId, validated);
    const conventions = rows.map(toConventionDto);
    return { count: conventions.length, conventions };
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConventionInput,
  ): Promise<Convention> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
      ...(patch.evidence !== undefined
        ? {
            evidencePath: patch.evidence.file,
            evidenceLine: patch.evidence.line,
            evidenceCode: patch.evidence.code,
          }
        : {}),
    });
    if (!row) throw new NotFoundError('Convention not found');
    return toConventionDto(row);
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async createSkillFromConventions(
    workspaceId: string,
    input: CreateSkillFromConventionsInput,
  ): Promise<Skill> {
    const accepted = await this.repo.listAccepted(workspaceId, input.repo_id);
    if (accepted.length === 0) {
      throw new ValidationError('No accepted conventions to turn into a skill.');
    }
    const body = buildSkillBody(input.skill_name, input.description, accepted.map(toConventionDto));
    const evidenceFiles = [
      ...new Set(accepted.map((c) => c.evidencePath).filter((p): p is string => p !== null)),
    ];
    return this.skills.create(workspaceId, {
      name: input.skill_name,
      description: input.description,
      type: 'convention',
      source: 'extracted',
      body,
      enabled: input.enabled,
      evidence_files: evidenceFiles,
    });
  }

  // ---- internals ----

  private async buildContext(clonePath: string, samplePaths: string[]): Promise<string> {
    const parts: string[] = [];
    let total = 0;
    const add = (header: string, content: string): boolean => {
      const block = `${header}\n${content}\n\n`;
      if (total + block.length > MAX_CONTEXT_CHARS) return false;
      parts.push(block);
      total += block.length;
      return true;
    };

    for (const cfg of CONFIG_FILE_CANDIDATES) {
      const content = await this.readClone(clonePath, cfg);
      if (content === null) continue;
      if (!add(`=== CONFIG: ${cfg} ===`, content.slice(0, MAX_FILE_CHARS))) break;
    }

    for (const file of samplePaths) {
      const content = await this.readClone(clonePath, file);
      if (content === null) continue;
      // Number the lines so the model can cite accurate 1-based line numbers.
      const numbered = content
        .slice(0, MAX_FILE_CHARS)
        .split('\n')
        .map((line, i) => `${i + 1}: ${line}`)
        .join('\n');
      if (!add(`=== FILE: ${file} ===`, numbered)) break;
    }
    return parts.join('');
  }

  private async validate(
    clonePath: string,
    candidates: ExtractedCandidate[],
  ): Promise<InsertConvention[]> {
    const cache = new Map<string, string | null>();
    const out: InsertConvention[] = [];
    for (const c of candidates) {
      const file = c.evidence.file;
      if (!cache.has(file)) cache.set(file, await this.readClone(clonePath, file));
      if (evidenceMatches(cache.get(file)!, c.evidence.line, c.evidence.code)) {
        out.push({
          category: c.category,
          rule: c.rule,
          evidencePath: c.evidence.file,
          evidenceLine: c.evidence.line,
          evidenceCode: c.evidence.code,
          confidence: c.confidence,
        });
      }
    }
    return out;
  }

  /** Read a repo-relative file from the clone, guarding against path traversal. */
  private async readClone(clonePath: string, rel: string): Promise<string | null> {
    const root = resolve(clonePath);
    const full = resolve(root, rel);
    if (full !== root && !full.startsWith(root + sep)) return null;
    return readFile(full, 'utf8').catch(() => null);
  }
}

/** Build the skill markdown from accepted conventions. Pure. */
function buildSkillBody(
  skillName: string,
  description: string,
  conventions: Convention[],
): string {
  const intro = `# ${skillName}\n\n${description}. Flag changes that violate any rule below and cite the offending \`file:line\`.`;
  const blocks = conventions.map((c) => {
    const heading = `## ${c.category ?? 'convention'}`;
    const evidence = c.evidence
      ? `\n\nDetected in \`${c.evidence.file}:${c.evidence.line}\`:\n\`\`\`\n${c.evidence.code}\n\`\`\``
      : '';
    return `${heading}\n${c.rule}${evidence}`;
  });
  return [intro, ...blocks].join('\n\n');
}
