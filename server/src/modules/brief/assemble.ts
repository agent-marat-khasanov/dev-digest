import { readFile, stat } from 'node:fs/promises';
import type { BlastRadius, Risk, RiskSeverity, SmartDiff } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveInClone } from '../../platform/fs-guard.js';
import { MAX_FILE_SIZE } from '../repo-intel/constants.js';
import type { PullRow } from '../reviews/repository.js';
import { BlastService } from '../blast/service.js';
import { SmartDiffService } from '../smart-diff/service.js';
import { IntentRepository, type PrIntentRow } from '../intent/repository.js';
import type { BriefModelOutput } from './prompt.js';

/**
 * ≤ 8000-token hard budget for the assembled model input (AC-3).
 * Measured with `container.tokenizer.count` over each block's raw body.
 */
export const BUDGET_TOKENS = 8000;

/**
 * A single untrusted section of the model input. `dropTier` is the fixed
 * drop-order priority used by `enforceBudget` (AC-3a) — lower drops first;
 * `undefined` means the block is NEVER dropped (the intent digest + the
 * blast-radius summary, the grounding spine).
 *
 * Drop order (lowest tier first): specs (1) → linked issue (2) →
 * smart-diff detail (3) → blast detail (4).
 */
export interface PromptBlock {
  label: string;
  body: string;
  dropTier?: number;
}

const DROP_TIER = {
  spec: 1,
  issue: 2,
  smartDiffDetail: 3,
  blastDetail: 4,
} as const;

/**
 * Everything `enforceBudget`/`buildUserMessage` need to build the model
 * input, plus the raw structured artifacts `buildChangedFileSet`/
 * `buildRiskRefSet`/`validateBrief` need for the two real-reference
 * allowlists (AC-6/AC-7).
 */
export interface BriefArtifacts {
  pull: PullRow;
  blocks: PromptBlock[];
  blast: BlastRadius;
  smartDiff: SmartDiff;
  prFilePaths: string[];
}

/**
 * Regex to extract the first GitHub issue/PR number from a PR body.
 * COPIED from `intent/service.ts` (not exported/imported) — the plan's
 * deliberate no-cross-module-edit choice (cross-review non-blocking #1).
 * Matches either a full URL or a bare `#N` reference.
 */
const ISSUE_REF_REGEX =
  /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/(?:issues|pull)\/(\d+)|(?:^|[\s(,])#(\d+)/gm;

function extractLinkedIssueNumber(body: string | null | undefined): number | null {
  if (!body) return null;
  ISSUE_REF_REGEX.lastIndex = 0;
  const match = ISSUE_REF_REGEX.exec(body);
  if (!match) return null;
  const n = match[1] ?? match[2];
  return n !== undefined ? parseInt(n, 10) : null;
}

function buildIntentDigest(row: PrIntentRow): string {
  const lines = [`Intent: ${row.intent}`];
  if (row.inScope.length > 0) lines.push('In scope:', ...row.inScope.map((s) => `- ${s}`));
  if (row.outOfScope.length > 0) lines.push('Out of scope:', ...row.outOfScope.map((s) => `- ${s}`));
  if (row.risks.length > 0) {
    lines.push('Risk areas:', ...row.risks.map((r) => `- [${r.severity}] ${r.title}`));
  }
  return lines.join('\n');
}

function buildBlastDetail(blast: BlastRadius): string | undefined {
  if (blast.downstream.length === 0) return undefined;
  const lines: string[] = [];
  for (const d of blast.downstream) {
    lines.push(`### ${d.symbol}`);
    for (const c of d.callers) lines.push(`- called by \`${c.name}\` in ${c.file}:${c.line}`);
    if (d.endpoints_affected.length > 0) lines.push(`endpoints: ${d.endpoints_affected.join(', ')}`);
    if (d.crons_affected.length > 0) lines.push(`crons: ${d.crons_affected.join(', ')}`);
  }
  return lines.join('\n');
}

/**
 * Prompt-safe stats-only view of the smart-diff groups (NG2/AC-1 hard
 * constraint) — per group only role, file paths, and numeric add/del/
 * finding-line counts. NEVER `pseudocode_summary`, patches, or any
 * snippet-shaped field, even if `SmartDiff` grows one later.
 */
function buildSmartDiffDetail(smartDiff: SmartDiff): string | undefined {
  if (smartDiff.groups.length === 0) return undefined;
  const lines: string[] = [];
  for (const g of smartDiff.groups) {
    lines.push(`### ${g.role}`);
    for (const f of g.files) {
      lines.push(`- ${f.path} (+${f.additions}/-${f.deletions}, ${f.finding_lines.length} finding line(s))`);
    }
  }
  return lines.join('\n');
}

/** Reads a repo-relative file from the clone, path-guarded + size-capped, or null. */
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

/**
 * Full flat union of context-attached spec paths across ALL workspace
 * agents, deduped and given ONE global deterministic (lexical) order — NOT
 * dependent on `agentsRepo.list` iteration order (AC-2a, cross-review
 * blocker #3).
 */
async function collectSpecPaths(container: Container, workspaceId: string): Promise<string[]> {
  const agents = await container.agentsRepo.list(workspaceId);
  const paths = new Set<string>();
  for (const agent of agents) {
    const [agentLinks, inherited] = await Promise.all([
      container.contextRepo.listAgentContext(agent.id),
      container.contextRepo.skillInheritedContext(agent.id),
    ]);
    for (const l of agentLinks) paths.add(l.path);
    for (const l of inherited) paths.add(l.path);
  }
  return [...paths].sort();
}

/**
 * Gathers every artifact the brief needs, via existing read paths ONLY —
 * zero extra model calls (AC-2). Each section is best-effort / omit-when-
 * empty (AC-13/AC-14/AC-15): no cached intent, a degraded blast index, no
 * linked issue, or no attached specs all still produce a valid input.
 */
export async function gatherArtifacts(
  container: Container,
  workspaceId: string,
  prId: string,
): Promise<BriefArtifacts> {
  const pull = await container.reviewRepo.getPull(workspaceId, prId);
  if (!pull) throw new NotFoundError('Pull request not found');

  const repoRow = await container.reviewRepo.getRepo(pull.repoId);
  if (!repoRow) throw new NotFoundError('Repository not found');

  // Cached intent digest — DB-only read, never (re)generates (AC-13).
  const intentRow = await new IntentRepository(container.db).getByPr(prId);

  // Blast radius — degraded-safe (empty best-effort result on a missing/off
  // index), so the real-reference set falls back to changed files (AC-14).
  const blast = await new BlastService(container).getBlast(workspaceId, prId);

  // Smart-diff — DB-only, mapped to a stats-only view before it ever
  // reaches the prompt (NG2 hard constraint, enforced here and only here).
  const smartDiff = await new SmartDiffService(container).getSmartDiff(workspaceId, prId);

  const prFiles = await container.reviewRepo.getPrFiles(prId);
  const prFilePaths = prFiles.map((f) => f.path);

  // Linked issue — best-effort; no token / inaccessible issue degrades to
  // omitted (AC-15), exactly like `intent/service.ts`.
  let issueText: string | undefined;
  const issueNumber = extractLinkedIssueNumber(pull.body);
  if (issueNumber !== null) {
    try {
      const github = await container.github();
      const issue = await github.getIssue({ owner: repoRow.owner, name: repoRow.name }, issueNumber);
      issueText = `Title: ${issue.title}${issue.body ? `\n\n${issue.body}` : ''}`;
    } catch {
      issueText = undefined;
    }
  }

  // Attached specs — deterministic union across all workspace agents, then
  // clone-read each in that order; missing/oversize/absent-clone paths are
  // silently skipped (AC-2a, AC-15).
  const specBlocks: PromptBlock[] = [];
  if (repoRow.clonePath) {
    const clonePath = repoRow.clonePath;
    const specPaths = await collectSpecPaths(container, workspaceId);
    for (const path of specPaths) {
      const content = await readClonedFile(clonePath, path);
      if (content === null) continue;
      specBlocks.push({ label: `spec:${path}`, body: content, dropTier: DROP_TIER.spec });
    }
  }

  const blocks: PromptBlock[] = [];
  if (intentRow) blocks.push({ label: 'intent_digest', body: buildIntentDigest(intentRow) });
  blocks.push({ label: 'blast_summary', body: blast.summary });
  const blastDetail = buildBlastDetail(blast);
  if (blastDetail) blocks.push({ label: 'blast_detail', body: blastDetail, dropTier: DROP_TIER.blastDetail });
  const smartDiffDetail = buildSmartDiffDetail(smartDiff);
  if (smartDiffDetail) {
    blocks.push({ label: 'smart_diff_detail', body: smartDiffDetail, dropTier: DROP_TIER.smartDiffDetail });
  }
  if (issueText) blocks.push({ label: 'linked_issue', body: issueText, dropTier: DROP_TIER.issue });
  blocks.push(...specBlocks);

  return { pull, blocks, blast, smartDiff, prFilePaths };
}

/**
 * Drops whole blocks in the fixed order specs → issue → smart-diff detail →
 * blast detail until the total falls at/under the budget, or nothing more
 * droppable remains (AC-3/AC-3a). Never drops a block with no `dropTier`
 * (intent digest + blast summary). Pure function over a `{ count }`
 * tokenizer so it stays independently testable.
 */
export function enforceBudget(
  blocks: PromptBlock[],
  tokenizer: { count(text: string): number },
): PromptBlock[] {
  const kept = [...blocks];
  const total = () => kept.reduce((sum, b) => sum + tokenizer.count(b.body), 0);

  while (total() > BUDGET_TOKENS) {
    const droppable = kept.filter((b) => b.dropTier !== undefined);
    if (droppable.length === 0) break;
    const minTier = Math.min(...droppable.map((b) => b.dropTier!));
    const idx = kept.findIndex((b) => b.dropTier === minTier);
    kept.splice(idx, 1);
  }
  return kept;
}

/** CHANGED files only — the allowlist for `review_focus[].path` (AC-7). */
export function buildChangedFileSet(smartDiff: SmartDiff, prFilePaths: string[]): Set<string> {
  const set = new Set<string>();
  for (const g of smartDiff.groups) for (const f of g.files) set.add(f.path);
  for (const p of prFilePaths) set.add(p);
  return set;
}

/**
 * Broader real-reference set for `risks[].file_refs` (AC-6): changed files +
 * blast changed-symbol files + caller files + affected endpoints. A degraded
 * (empty) blast contributes nothing, so this collapses toward
 * `changedFileSet` automatically — no special-casing needed (AC-14).
 */
export function buildRiskRefSet(changedFileSet: Set<string>, blast: BlastRadius): Set<string> {
  const set = new Set(changedFileSet);
  for (const s of blast.changed_symbols) set.add(s.file);
  for (const d of blast.downstream) {
    for (const c of d.callers) set.add(c.file);
    for (const e of d.endpoints_affected) set.add(e);
  }
  return set;
}

export interface ValidatedBrief {
  what: string;
  why: string;
  risk_level: RiskSeverity;
  risks: Risk[];
  review_focus: { path: string; reason: string }[];
}

/**
 * Validates the model output against the two real-reference allowlists
 * (AC-6/AC-7): `review_focus` entries whose `path` is not a changed file are
 * dropped (preserving model order); `risks[].file_refs` entries not in the
 * broader ref set are dropped. Invalid entries are dropped, never surfaced
 * as dead/clickable links.
 */
export function validateBrief(
  modelOut: BriefModelOutput,
  changedFileSet: Set<string>,
  riskRefSet: Set<string>,
): ValidatedBrief {
  return {
    what: modelOut.what,
    why: modelOut.why,
    risk_level: modelOut.risk_level,
    risks: modelOut.risks.map((r) => ({
      ...r,
      file_refs: r.file_refs.filter((ref) => riskRefSet.has(ref)),
    })),
    review_focus: modelOut.review_focus.filter((item) => changedFileSet.has(item.path)),
  };
}
