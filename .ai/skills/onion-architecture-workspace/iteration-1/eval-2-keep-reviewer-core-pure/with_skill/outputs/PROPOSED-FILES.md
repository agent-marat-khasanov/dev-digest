# Proposed files (5)

## `reviewer-core/src/conflicts.ts`

```ts
import type { Finding } from '@devdigest/shared';

/**
 * Cross-PR conflict annotation — the sibling of the grounding gate.
 *
 * A finding is far more actionable when it says "the file you are touching is
 * ALREADY being changed by another open PR". Deciding that is pure set logic,
 * so it lives here in the core and runs on the findings that survived grounding.
 *
 * The engine performs NO I/O. The caller resolves the other open PRs and the
 * files they change through its own `GitHubClient` port (the server does it via
 * `container.github()`) and hands them in as plain data. Nothing in this file
 * knows about GitHub, Octokit, HTTP, or a database.
 */

/** One OTHER open PR in the same repo, plus the repo-relative paths it changes. */
export interface OpenPrChanges {
  number: number;
  title: string;
  author: string;
  /** Repo-relative paths changed by that PR (same shape as `UnifiedDiff.files[].path`). */
  files: string[];
}

/** file path → the other open PRs that already touch it. */
export type ConflictIndex = Map<string, OpenPrChanges[]>;

export interface AnnotatedFindings {
  findings: Finding[];
  /** How many findings received a conflict note (for the run's log / trace). */
  annotated: number;
}

/** At most this many PRs are named in one note; the remainder collapse to "+N more". */
const MAX_PRS_IN_NOTE = 3;

/**
 * Invert "PR → files" into "file → PRs". The PR under review is NOT filtered
 * here — the caller passes only the OTHER open PRs (it is the one that knows
 * which PR is being reviewed).
 */
export function buildConflictIndex(openPrs: OpenPrChanges[]): ConflictIndex {
  const index: ConflictIndex = new Map();
  for (const pr of openPrs) {
    for (const file of pr.files) {
      const list = index.get(file);
      if (list) list.push(pr);
      else index.set(file, [pr]);
    }
  }
  return index;
}

/** The markdown sentence appended to a conflicting finding's rationale. */
export function conflictNote(file: string, prs: OpenPrChanges[]): string {
  const named = prs
    .slice(0, MAX_PRS_IN_NOTE)
    .map((pr) => `#${pr.number} "${pr.title}" (@${pr.author})`);
  const rest = prs.length - named.length;
  const list = rest > 0 ? `${named.join(', ')}, +${rest} more` : named.join(', ');
  return (
    `**Conflict:** \`${file}\` is also changed by ${prs.length} other open PR(s): ${list}. ` +
    `Coordinate before merging — the change suggested here may collide with theirs.`
  );
}

/**
 * Append a conflict note to every finding whose file another open PR already
 * touches. Findings are returned as NEW objects (no mutation); severity, lines
 * and category are untouched — only the human-readable `rationale` grows, so
 * the score derived from these findings is unchanged.
 */
export function annotateConflicts(findings: Finding[], index: ConflictIndex): AnnotatedFindings {
  if (index.size === 0) return { findings, annotated: 0 };
  let annotated = 0;
  const out = findings.map((finding) => {
    const prs = index.get(finding.file);
    if (!prs || prs.length === 0) return finding;
    annotated += 1;
    return {
      ...finding,
      rationale: `${finding.rationale}\n\n${conflictNote(finding.file, prs)}`,
    };
  });
  return { findings: out, annotated };
}
```

## `reviewer-core/src/index.ts`

```ts
/**
 * @devdigest/reviewer-core — the review engine.
 *
 * Pure review logic shared by the server (local reviews in the studio) and the
 * agent-runner (CI). NO database, GitHub, or filesystem access; the only side
 * effect is an LLM call through an INJECTED LLMProvider (so it is mock-testable).
 *
 * Consumers wire it via a tsconfig path alias (`@devdigest/reviewer-core` →
 * `../reviewer-core/src`) and consume the TypeScript source directly (tsx in
 * dev, vitest in tests, @vercel/ncc bundle in the runner). The package itself
 * never emits JS — its `build` is a type-check.
 */

// Prompt assembly + prompt-injection hardening.
export {
  INJECTION_GUARD,
  assemblePrompt,
  wrapUntrusted,
  type PromptParts,
  type AssembledPrompt,
} from './prompt.js';

// Citation grounding — the mandatory mechanical gate for diff findings.
export { groundFindings, groundingSummary, type GroundingResult } from './grounding.js';

// Cross-PR conflicts — pure "file → other open PRs" logic. The CALLER resolves
// the open PRs + their changed files through its GitHubClient port and passes
// them in as plain data (`ReviewInput.otherOpenPrs`); the engine stays I/O-free.
export {
  buildConflictIndex,
  annotateConflicts,
  conflictNote,
  type OpenPrChanges,
  type ConflictIndex,
  type AnnotatedFindings,
} from './conflicts.js';

// Structured-output helpers (Zod → JSON Schema + parse-with-repair).
export {
  toJsonSchema,
  extractJson,
  parseWithRepair,
  type JsonSchema,
  type ParseResult,
} from './llm/structured.js';

// Map-reduce helpers (reduce partials, slice a file's diff).
export { reduceReviews, sliceDiff } from './review/reduce.js';

// The engine entry point: given (diff + resolved agent inputs + LLM) → grounded Review.
export {
  reviewPullRequest,
  DEFAULT_MAP_THRESHOLD_LINES,
  DEFAULT_REVIEW_MAX_RETRIES,
  type ReviewInput,
  type ReviewOutcome,
  type ReviewEvent,
  type ReviewStrategy,
  type ReviewMode,
} from './review/run.js';

// Output: grounded Review → GitHubReviewPayload (body + inline comments + event).
export {
  toReviewPayload,
  gateTriggered,
  countBlockers,
  type ToReviewOptions,
} from './output/to-review.js';

// The single OpenAI-compatible structured provider (OpenRouter), shared by the
// CI runner and the server's openrouter path. Owns session grouping + guards.
export { OpenRouterProvider, type OpenRouterProviderOptions } from './llm/openrouter.js';

// Intent generation — pure LLM call that derives PR motivation from title, body, spec, and diff.
export {
  generateIntent,
  IntentDraftSchema,
  type IntentDraft,
} from './intent/generate.js';
```

## `reviewer-core/src/review/run.ts`

```ts
import type {
  Finding,
  LLMProvider,
  PromptAssembly,
  Review,
  RunEventKind,
  UnifiedDiff,
} from '@devdigest/shared';
import { Review as ReviewSchema } from '@devdigest/shared';
import { assemblePrompt } from '../prompt.js';
import { groundFindings, groundingSummary } from '../grounding.js';
import { annotateConflicts, buildConflictIndex, type OpenPrChanges } from '../conflicts.js';
import { reduceReviews, scoreFromFindings, sliceDiff } from './reduce.js';

/**
 * reviewPullRequest — the review engine entry point.
 *
 * given (diff + resolved agent inputs + injected LLM) → grounded Review.
 *
 * This is the pure core lifted out of the server's `ReviewService.runOneAgent`:
 * assemble prompt → single-pass OR map-reduce per file → reduce → SHARED
 * citation-grounding gate → cross-PR conflict annotation. It performs NO I/O
 * beyond the injected LLM provider (no DB, GitHub, fs, memory retrieval, intent,
 * or persistence) — those stay in the caller (server persists + streams SSE;
 * runner posts + writes an artifact).
 *
 * Skill bodies / memory / specs / other-open-PR file lists are RESOLVED inputs
 * here: the caller turns AgentManifest skill slugs into bodies (DB in the studio,
 * fs in the runner) and resolves the other open PRs through its GitHubClient port.
 */

/** Default map-reduce threshold (matches the server's FILE_MAP_THRESHOLD_LINES). */
export const DEFAULT_MAP_THRESHOLD_LINES = 400;
/** Default structured-output reprompt retries (matches REVIEW_MAX_RETRIES). */
export const DEFAULT_REVIEW_MAX_RETRIES = 2;

export type ReviewStrategy = 'auto' | 'single-pass' | 'map-reduce';
export type ReviewMode = 'single-pass' | 'map-reduce';

/** Progress event emitted during a review (server → SSE bus, runner → log). */
export interface ReviewEvent {
  kind: RunEventKind;
  msg: string;
  data?: unknown;
}

export interface ReviewInput {
  /** Agent system prompt (trusted). */
  systemPrompt: string;
  /** Model id understood by the injected provider (e.g. 'deepseek/deepseek-v4-flash'). */
  model: string;
  /** The PR's unified diff (already parsed; hunks carry new-side line numbers). */
  diff: UnifiedDiff;
  /** Injected LLM provider (OpenRouter in CI, OpenAI/Anthropic in the studio). */
  llm: LLMProvider;
  /** 'auto' (default) picks single-pass unless the diff is large + multi-file. */
  strategy?: ReviewStrategy;
  /** Resolved skill bodies (NOT slugs). */
  skills?: string[];
  /** Curated memory items. */
  memory?: string[];
  /** Project-context spec chunks (untrusted; delimiter-wrapped downstream). */
  specs?: string[];
  /**
   * Optional callers-of-changed-symbols digest (T1.3). Untrusted; rendered
   * before the diff section. Empty/undefined → section omitted.
   */
  callers?: string;
  /**
   * Optional repo skeleton / map (T3). Untrusted; rendered before the project
   * context section. Empty/undefined → section omitted.
   */
  repoMap?: string;
  /** PR author's description/body (untrusted; truncated + delimiter-wrapped in
      the prompt). Empty/undefined → section omitted. */
  prDescription?: string;
  /**
   * Derived PR intent digest (composed by the caller from the cached pr_intent
   * row — no model call). Untrusted; rendered after the PR description.
   * Empty/undefined → section omitted.
   */
  intent?: string;
  /**
   * The OTHER open PRs in the same repo and the files each of them changes —
   * resolved by the CALLER through its GitHubClient port (the engine never
   * talks to GitHub). The PR under review must already be excluded by the
   * caller. Every grounded finding whose file appears here gets a conflict
   * note appended to its rationale. Empty/undefined → findings are byte-
   * identical to the pre-feature shape.
   */
  otherOpenPrs?: OpenPrChanges[];
  /** Task framing line, e.g. "Review PR #482 …". */
  task?: string;
  /** Override the structured-output retry budget. */
  maxRetries?: number;
  /** Override the map-reduce line threshold. */
  mapThresholdLines?: number;
  /**
   * OpenRouter session id — forwarded on every LLM call so all chunks of this
   * review group into one session in the OpenRouter dashboard.
   */
  sessionId?: string;
  /** Progress sink. */
  onEvent?: (e: ReviewEvent) => void;
  /**
   * Cancellation checkpoint, called before each (expensive) chunk LLM call.
   * Supply a function that THROWS to abort mid-run (the caller owns the error
   * type, e.g. the server's RunCancelledError); the engine stays agnostic.
   */
  checkCancelled?: () => void;
}

export interface ReviewOutcome {
  /** The reduced, GROUNDED review (findings that survived the citation gate). */
  review: Review;
  /** Human-readable grounding summary, e.g. "3/4 passed". */
  grounding: string;
  /** Findings dropped by grounding, with reasons (for logs / "never go silent"). */
  dropped: { finding: Finding; reason: string }[];
  /** How many kept findings point at a file another open PR already touches. */
  conflicts: number;
  /** Which path ran. */
  mode: ReviewMode;
  /** Prompt assembly (for the run trace). Single-pass: the one call; map-reduce: the whole-diff assembly. */
  assembly: PromptAssembly;
  /** Per-chunk labels (for the run trace's tool_calls). */
  chunks: { label: string }[];
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  /** Joined raw model outputs (for the run trace). */
  raw: string;
}

function selectMode(strategy: ReviewStrategy, diff: UnifiedDiff, threshold: number): ReviewMode {
  if (strategy === 'single-pass') return 'single-pass';
  if (strategy === 'map-reduce') return diff.files.length > 1 ? 'map-reduce' : 'single-pass';
  // auto: map-reduce only when the diff is both large AND multi-file (else 1 call).
  const totalLines = diff.files.reduce((n, f) => n + f.additions + f.deletions, 0);
  return totalLines > threshold && diff.files.length > 1 ? 'map-reduce' : 'single-pass';
}

export async function reviewPullRequest(input: ReviewInput): Promise<ReviewOutcome> {
  const threshold = input.mapThresholdLines ?? DEFAULT_MAP_THRESHOLD_LINES;
  const maxRetries = input.maxRetries ?? DEFAULT_REVIEW_MAX_RETRIES;
  const mode = selectMode(input.strategy ?? 'auto', input.diff, threshold);
  const emit = (kind: RunEventKind, msg: string, data?: unknown) =>
    input.onEvent?.({ kind, msg, data });

  const promptParts = {
    system: input.systemPrompt,
    skills: input.skills,
    memory: input.memory,
    specs: input.specs,
    callers: input.callers,
    repoMap: input.repoMap,
    prDescription: input.prDescription,
    intent: input.intent,
    task: input.task,
  };

  // Whole-diff assembly is the trace default; overwritten below for single-pass.
  let assembly: PromptAssembly = assemblePrompt({ ...promptParts, diff: input.diff.raw }).assembly;

  const chunks =
    mode === 'map-reduce'
      ? input.diff.files.map((f) => ({ label: f.path, diffText: sliceDiff(input.diff, f.path) }))
      : [{ label: 'all files', diffText: input.diff.raw }];

  emit(
    'info',
    mode === 'map-reduce'
      ? `Large diff → map-reduce over ${input.diff.files.length} files`
      : `Reviewing ${input.diff.files.length} changed file(s) in one pass`,
  );

  const partials: Review[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd: number | null = 0;
  const raws: string[] = [];

  for (const chunk of chunks) {
    // Cancellation checkpoint — stop before the next (expensive) LLM call.
    input.checkCancelled?.();
    // 'map:' prefix only for the map-reduce path (one call per file). In
    // single-pass there is exactly one chunk (the whole diff) — don't mislabel it.
    emit(
      'tool',
      mode === 'map-reduce' ? `map: reviewing ${chunk.label}` : `Reviewing ${chunk.label} in one pass`,
      { file: chunk.label },
    );
    const a = assemblePrompt({ ...promptParts, diff: chunk.diffText });
    if (mode === 'single-pass') assembly = a.assembly;
    const res = await input.llm.completeStructured<Review>({
      model: input.model,
      schema: ReviewSchema,
      schemaName: 'Review',
      messages: a.messages,
      maxRetries,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    });
    tokensIn += res.tokensIn;
    tokensOut += res.tokensOut;
    costUsd = costUsd == null || res.costUsd == null ? null : costUsd + res.costUsd;
    raws.push(res.raw);
    partials.push(res.data);
    emit('result', `${chunk.label}: ${res.data.findings.length} candidate finding(s)`);
  }

  const merged = reduceReviews(partials);
  emit(
    'result',
    `Reduced to ${merged.findings.length} finding(s); verdict=${merged.verdict}, score=${merged.score}`,
  );

  // SHARED citation-grounding gate (the only post-step; not duplicated per strategy).
  const ground = groundFindings(merged.findings, input.diff);
  const grounding = groundingSummary(ground);
  for (const d of ground.dropped) {
    emit('info', `grounding dropped "${d.finding.title}": ${d.reason}`);
  }
  emit('result', `Citation grounding: ${grounding}`);

  // Cross-PR conflicts — pure set logic over the other open PRs the caller
  // resolved for us (file → PRs). Findings whose file another open PR already
  // touches get a note appended to their rationale, so the finding text itself
  // says so. Only the rationale changes: severities (and therefore the score)
  // are untouched, and with no input the findings come out exactly as before.
  const conflictIndex = buildConflictIndex(input.otherOpenPrs ?? []);
  const annotated = annotateConflicts(ground.kept, conflictIndex);
  if (annotated.annotated > 0) {
    emit(
      'result',
      `Cross-PR conflicts: ${annotated.annotated}/${annotated.findings.length} finding(s) point at a file another open PR already touches`,
    );
  }

  // Score is derived from the findings that SURVIVED grounding (not the model's
  // self-reported number, and not the pre-grounding set) so the score, the
  // findings list, and the deterministic event always agree.
  return {
    review: {
      ...merged,
      findings: annotated.findings,
      score: scoreFromFindings(annotated.findings),
    },
    grounding,
    dropped: ground.dropped,
    conflicts: annotated.annotated,
    mode,
    assembly,
    chunks: chunks.map((c) => ({ label: c.label })),
    tokensIn,
    tokensOut,
    costUsd,
    raw: raws.join('\n---\n'),
  };
}
```

## `server/src/modules/reviews/constants.ts`

```ts
/**
 * Review module constants.
 */

/**
 * Studio review strategy. 'single-pass' = send the WHOLE diff in ONE LLM call.
 * We deliberately do NOT use 'auto'/map-reduce by default: map-reduce makes one
 * call PER FILE, which is slow and fragile (any single file's transient 5xx
 * fails the entire run) and unnecessary — the whole diff already fits the
 * model's context.
 */
export const REVIEW_STRATEGY = 'single-pass' as const;

/**
 * How many OTHER open PRs are scanned for overlapping files before a review.
 * Each one costs a `getPullRequest` call, so the newest N (GitHub returns the
 * list most-recently-updated first) bound the pre-work on busy repos.
 */
export const MAX_CONFLICT_PRS = 10;
```

## `server/src/modules/reviews/run-executor.ts`

```ts
import { readFile, stat } from 'node:fs/promises';
import type { Container } from '../../platform/container.js';
import type { Provider, Review, RunTrace, SkillBlock, SpecBlock, UnifiedDiff } from '@devdigest/shared';
import { reviewPullRequest, countBlockers, type OpenPrChanges } from '@devdigest/reviewer-core';
import { RunLogger } from '../../platform/run-logger.js';
import * as schema from '../../db/schema.js';
import type { AgentRow } from '../../db/rows.js';
import type { ReviewRepository, FindingRow, PullRow, ReviewRow } from './repository.js';
import { MAX_CONFLICT_PRS, REVIEW_STRATEGY } from './constants.js';
import { taskLine } from './helpers.js';
import { selectActiveSkillBlocks } from './skill-blocks.js';
import { orderContextPaths } from './context-blocks.js';
import { loadDiff } from './diff-loader.js';
import { IntentRepository } from '../intent/repository.js';
import { resolveInClone } from '../../platform/fs-guard.js';
import { MAX_FILE_SIZE } from '../repo-intel/constants.js';

/** Thrown by a run when the user cancels it mid-flight (between map files). */
export class RunCancelledError extends Error {
  constructor() {
    super('Run cancelled');
    this.name = 'RunCancelledError';
  }
}

/** Minimal structured logger (pino-compatible: (obj, msg)) for runtime logs. */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
};

// A reduced "Review per file" — same schema as Review (the model returns a small
// Review per file; we merge findings + take the worst verdict / mean score).
export type RunOutcome = {
  review: ReviewRow;
  findings: FindingRow[];
  grounding: string;
  raw: Review;
};

/**
 * Owns the background execution of queued agent runs (extracted from
 * ReviewService; behaviour unchanged). Loads the diff + intent once, then
 * map-reduces each agent, streaming events over the runBus and persisting each
 * review. Per-agent failures are isolated.
 */
export class ReviewRunExecutor {
  constructor(
    private container: Container,
    private repo: ReviewRepository,
    private agents: Container['agentsRepo'],
  ) {}

  /**
   * Background execution of the queued agent runs (NOT awaited by the route).
   * Loads the diff + intent once, then map-reduces each agent, streaming events
   * over the runBus and persisting each review. Per-agent failures are isolated.
   */
  async executeRuns(
    workspaceId: string,
    pull: PullRow,
    repo: typeof schema.repos.$inferSelect,
    jobs: { agent: AgentRow; runId: string }[],
    logger?: Logger,
  ): Promise<void> {
    // ONE logger fanned out over every queued run: shared pre-work (diff +
    // intent) is streamed into each target agent's Live Log and persisted into
    // each run's trace. Per-agent work below narrows it to a single run.
    const runLog = new RunLogger(
      this.container.runBus,
      jobs.map((j) => j.runId),
      logger,
      { prId: pull.id },
    );

    // Pre-work failure (e.g. diff load) fails EVERY queued run. The error was
    // already emitted via runLog (fanned out → in each run's buffer); here we
    // mark the rows failed and persist the buffered log so it survives a reload.
    const failAll = async (msg: string) => {
      for (const { runId, agent } of jobs) {
        await this.repo
          .completeAgentRun(runId, {
            status: 'failed',
            durationMs: 0,
            tokensIn: 0,
            tokensOut: 0,
            findingsCount: 0,
            grounding: '0/0 passed',
            error: msg,
          })
          .catch(() => undefined);
        await this.repo
          .saveRunTrace(runId, this.traceFromBuffer(runId, pull, agent, '0/0 passed'))
          .catch(() => undefined);
        this.container.runBus.complete(runId);
      }
    };

    let diff: UnifiedDiff;
    try {
      diff = await runLog.step('Loading PR diff', () => loadDiff(this.container, this.repo, workspaceId, pull, repo), {
        kind: 'tool',
      });
    } catch (err) {
      runLog.error(`Failed to load PR diff: ${(err as Error).message}`);
      await failAll(`Failed to load PR diff: ${(err as Error).message}`);
      return;
    }
    runLog.info(`Diff ready — ${diff.files.length} changed file(s); starting ${jobs.length} agent run(s)`);

    // Cross-PR conflicts: the OTHER open PRs and the files they touch. Shared
    // pre-work like the diff — one GitHub lookup for ALL queued agents, not one
    // per agent. Best-effort: undefined on any failure (see buildOpenPrChanges).
    const otherOpenPrs = await this.buildOpenPrChanges(repo, pull, runLog);

    for (const { agent, runId } of jobs) {
      const agentStart = Date.now();
      logger?.info(
        { runId, agent: agent.name, provider: agent.provider, model: agent.model, prId: pull.id },
        `review: agent "${agent.name}" started (${agent.provider}/${agent.model})`,
      );
      try {
        const outcome = await this.runOneAgent(
          workspaceId,
          pull,
          repo,
          diff,
          agent,
          runId,
          runLog,
          otherOpenPrs,
        );
        logger?.info(
          {
            runId,
            agent: agent.name,
            findings: outcome.findings.length,
            grounding: outcome.grounding,
            durationMs: Date.now() - agentStart,
          },
          `review: agent "${agent.name}" done — ${outcome.findings.length} finding(s)`,
        );
      } catch (err) {
        // runOneAgent already persisted the failure/cancel (status + error +
        // trace) and completed the bus; here we only log at the run level.
        const cancelled = err instanceof RunCancelledError;
        logger?.[cancelled ? 'info' : 'error'](
          { runId, agent: agent.name, err: (err as Error).message, durationMs: Date.now() - agentStart },
          `review: agent "${agent.name}" ${cancelled ? 'cancelled' : 'failed'}`,
        );
      }
    }
  }

  /** Execute a single agent's review against a PR, streaming progress. */
  private async runOneAgent(
    workspaceId: string,
    pull: PullRow,
    repo: typeof schema.repos.$inferSelect,
    diff: UnifiedDiff,
    agent: AgentRow,
    runId: string,
    parentLog: RunLogger,
    otherOpenPrs?: OpenPrChanges[],
  ): Promise<RunOutcome> {
    const start = Date.now();
    // Narrow the fanned-out pre-work logger to THIS run; the shared diff/intent
    // events are already in this run's buffer, so the persisted trace below
    // (built from the buffer) includes them too.
    const runLog = parentLog.forRun(runId, { agent: agent.name });

    runLog.info(`Starting review with agent "${agent.name}" (${agent.provider}/${agent.model})`);

    try {
      // Resolve the agent's LLM provider. (container.llm throws if the provider
      // key is missing — caught below and persisted as a failed run.)
      const llm = await runLog.step(
        `Resolving ${agent.provider} provider`,
        () => this.container.llm(agent.provider as Provider),
        { kind: 'tool' },
      );

      // Per-agent repo-intel toggle (Agent editor). When an agent opts out we
      // skip all enrichment entirely so its prompt is identical to the
      // repo-intel-off baseline — independent of the global REPO_INTEL_ENABLED
      // flag, which still gates the facade internally.
      const repoIntelOn = agent.repoIntel !== false;
      if (!repoIntelOn) runLog.info('Repo intel disabled for this agent — skipping context enrichment');

      // T1.3 — callers-in-prompt. Best-effort: when repo-intel is off the facade
      // returns []; we omit the section and behavior is identical to the
      // pre-T1.3 prompt (acceptance #10).
      const callersDigest = repoIntelOn
        ? await this.buildCallersDigest(pull.repoId, diff, runLog)
        : undefined;

      // T3 — repo skeleton + "changed files are top-5%" framing. Both best-
      // effort: when repo-intel is off / unindexed the facade degrades and the
      // prompt is identical to the pre-T3 shape.
      const repoMap = repoIntelOn ? await this.buildRepoMapDigest(pull.repoId, runLog) : undefined;
      const rankNote = repoIntelOn ? await this.buildRankNote(pull.repoId, diff, runLog) : '';

      const task = taskLine(pull) + rankNote;

      // Derived PR intent (cached pr_intent row → compact digest). DB-only, no
      // model call — omitted when intent was never generated for this PR, so the
      // prompt is identical to the pre-intent shape in that case.
      const intentDigest = await this.buildIntentDigest(pull.id, runLog);

      // Resolve the agent's bound skills (ordered, enabled only) and tokenise
      // each body so the trace can render one collapsible PromptBlock per
      // skill, attributed by token cost. reviewer-core stays pure: we hand it
      // only strings; the per-skill metadata is rebuilt into the trace here.
      const skillBlocks = await this.buildSkillBlocks(agent, runLog);

      // T6 — project-context docs attached to the agent + inherited from its
      // enabled skills (ordered, deduped, read fresh from the clone). Best-
      // effort: any failure/missing-file is skipped, never fails the run.
      const specBlocks = await this.buildSpecBlocks(repo, agent, runLog);

      // ---- Engine: assemble → single-pass → grounding → conflicts -----------
      // The pure review pipeline lives in @devdigest/reviewer-core (shared with
      // the CI runner). The service owns only I/O: repo-intel context resolution
      // above, the GitHub open-PR lookup, and persistence + observability below.
      const outcome = await reviewPullRequest({
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        diff,
        llm,
        // Per-agent review strategy (configured in the Agent editor); falls back
        // to the studio default. single-pass = whole diff in one call.
        strategy: agent.strategy ?? REVIEW_STRATEGY,
        // T1.3 — pass the callers digest only when we built one. assemblePrompt
        // omits the section when this is empty/undefined.
        ...(callersDigest ? { callers: callersDigest } : {}),
        // T3 — repo skeleton, same omit-when-empty contract.
        ...(repoMap ? { repoMap } : {}),
        // Bound + enabled skills, in the order configured on the Agent editor.
        // assemblePrompt joins these into the "Skills / rules" section.
        ...(skillBlocks.length > 0 ? { skills: skillBlocks.map((s) => s.body) } : {}),
        // T6 — attached + inherited project-context docs. assemblePrompt joins
        // these under "## Project context", each wrapped as untrusted data.
        // Omitted entirely when nothing is attached (AC-21: byte-identical
        // prompt to the pre-feature shape).
        ...(specBlocks.length > 0 ? { specs: specBlocks.map((s) => s.body) } : {}),
        // PR author's description/body — untrusted; assemblePrompt wraps +
        // truncates it. Omitted when the PR has no body.
        ...(pull.body ? { prDescription: pull.body } : {}),
        // Derived intent digest (cached) — omit-when-empty, like callers/repoMap.
        ...(intentDigest ? { intent: intentDigest } : {}),
        // Other open PRs + the files they change (resolved above through the
        // GitHubClient port). The engine annotates every grounded finding whose
        // file one of them already touches; omitted → findings unchanged.
        ...(otherOpenPrs && otherOpenPrs.length > 0 ? { otherOpenPrs } : {}),
        task,
        sessionId: `${repo.owner}/${repo.name}#${pull.number}:${agent.name}`,
        onEvent: (e) => runLog.event(e.kind, e.msg, e.data),
        checkCancelled: () => {
          if (this.container.runBus.isCancelled(runId)) throw new RunCancelledError();
        },
      });
      const { tokensIn, tokensOut, costUsd, grounding } = outcome;

      const keptFindings = outcome.review.findings;

      // ---- Persist review + findings ----------------------------------------
      const review = await this.repo.insertReview({
        workspaceId,
        prId: pull.id,
        agentId: agent.id,
        runId,
        kind: 'review',
        verdict: outcome.review.verdict,
        summary: outcome.review.summary,
        score: outcome.review.score,
        model: agent.model,
      });
      const findingRows = await this.repo.insertFindings(review.id, keptFindings);
      runLog.result(`Persisted review ${review.id} with ${findingRows.length} finding(s)`);

      // Mark the commit this review ran against so the PR list can tell
      // reviewed / needs-review (head moved) / stale apart.
      await this.repo.markReviewed(pull.id, pull.headSha);

      const durationMs = Date.now() - start;

      // Deterministic blocker count (severity ≥ the agent's gate) — the signal
      // the timeline colors on, NOT the model's self-reported verdict.
      const blockers = countBlockers(keptFindings, agent.ciFailOn);

      // ---- Observability: agent_runs + ONE run_traces document --------------
      await this.repo.completeAgentRun(runId, {
        status: 'done',
        durationMs,
        tokensIn,
        tokensOut,
        costUsd,
        findingsCount: findingRows.length,
        grounding,
        score: outcome.review.score,
        blockers,
        error: null,
      });

      const trace: RunTrace = {
        config: {
          agent: agent.name,
          version: String(agent.version),
          provider: agent.provider,
          model: agent.model,
          pr: pull.number,
          source: 'local',
        },
        stats: {
          duration_ms: durationMs,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          cost_usd: costUsd,
          findings: findingRows.length,
          grounding,
        },
        prompt_assembly: {
          ...outcome.assembly,
          skill_blocks: skillBlocks.length > 0 ? skillBlocks : null,
          spec_blocks: specBlocks.length > 0 ? specBlocks : null,
        },
        tool_calls: outcome.chunks.map((c) => ({
          tool: 'review_file',
          args: c.label,
          meta: outcome.mode,
          ms: Math.round(durationMs / Math.max(outcome.chunks.length, 1)),
        })),
        raw_output: outcome.raw,
        memory_pulled: [],
        specs_read: specBlocks.map((b) => b.path),
        // Persisted log = the run's FULL event buffer (incl. shared pre-work:
        // diff load + intent), not just events recorded inside this method.
        log: runLog.logFor(runId),
      };
      runLog.info('Run complete; trace persisted');
      await this.repo.saveRunTrace(runId, trace);
      this.container.runBus.complete(runId);

      return { review, findings: findingRows, grounding, raw: outcome.review };
    } catch (err) {
      // Failure/cancel: persist status + the error text + the log-so-far so the
      // run (and WHY it failed) is visible on the UI after a reload.
      const cancelled = err instanceof RunCancelledError;
      const status = cancelled ? 'cancelled' : 'failed';
      const msg = cancelled ? 'Cancelled by user' : (err as Error).message;
      runLog.error(cancelled ? 'Run cancelled by user' : `Run failed: ${msg}`);
      await this.repo
        .completeAgentRun(runId, {
          status,
          durationMs: Date.now() - start,
          tokensIn: 0,
          tokensOut: 0,
          findingsCount: 0,
          grounding: '0/0 passed',
          error: msg,
        })
        .catch(() => undefined);
      await this.repo
        .saveRunTrace(runId, this.traceFromBuffer(runId, pull, agent, '0/0 passed', Date.now() - start))
        .catch(() => undefined);
      this.container.runBus.complete(runId);
      throw err;
    }
  }

  /**
   * Cross-PR conflicts — the OTHER open PRs in this repo and the repo-relative
   * paths each of them changes. This is the I/O half of the feature: it reaches
   * GitHub ONLY through the `GitHubClient` port resolved from the container, and
   * hands the engine plain data (`OpenPrChanges[]`), so reviewer-core stays pure.
   *
   * The PR under review is filtered out here (it is trivially "touching" its own
   * files) and the scan is capped at MAX_CONFLICT_PRS, since each PR costs one
   * `getPullRequest` call.
   *
   * Best-effort, like the other enrichments: no PAT, a rate limit, or any GitHub
   * error degrades to `undefined` (a Live Log info) and the findings come out
   * exactly as they did before this feature — it never fails a run.
   */
  private async buildOpenPrChanges(
    repo: typeof schema.repos.$inferSelect,
    pull: PullRow,
    runLog: RunLogger,
  ): Promise<OpenPrChanges[] | undefined> {
    const ref = { owner: repo.owner, name: repo.name };
    try {
      const github = await this.container.github();
      const open = (await github.listPullRequests(ref))
        .filter((pr) => pr.status === 'open' && pr.number !== pull.number)
        .slice(0, MAX_CONFLICT_PRS);
      if (open.length === 0) return undefined;

      const changes: OpenPrChanges[] = [];
      for (const pr of open) {
        const detail = await github.getPullRequest(ref, pr.number);
        changes.push({
          number: pr.number,
          title: pr.title,
          author: pr.author,
          files: detail.files.map((f) => f.path),
        });
      }
      const fileCount = new Set(changes.flatMap((c) => c.files)).size;
      runLog.info(
        `cross-PR conflicts: ${changes.length} other open PR(s) touching ${fileCount} file(s) loaded`,
      );
      return changes;
    } catch (err) {
      runLog.info(`cross-PR conflicts: GitHub lookup failed — ${(err as Error).message}`);
      return undefined;
    }
  }

  /**
   * Resolve the agent's enabled linked skills in order and tokenise each body.
   * Returns [] when the agent has no enabled skills, in which case the prompt
   * is identical to the pre-lesson shape (`assemblePrompt` omits the section)
   * and the trace records `skill_blocks: null`.
   */
  private async buildSkillBlocks(agent: AgentRow, runLog: RunLogger): Promise<SkillBlock[]> {
    let linked;
    try {
      linked = await this.agents.linkedSkills(agent.id);
    } catch (err) {
      runLog.info(`skills: failed to load linked skills — ${(err as Error).message}`);
      return [];
    }
    // Filter + tokenise via the pure helper so the rule is testable in isolation.
    const blocks = selectActiveSkillBlocks(linked, (text) => this.container.tokenizer.count(text));
    if (blocks.length === 0) return [];
    const total = blocks.reduce((sum, b) => sum + b.tokens, 0);
    runLog.info(`skills: attached ${blocks.length} skill(s), ${total} token(s) total`);
    return blocks;
  }

  /**
   * T6 — resolve the agent's attached project-context docs + docs inherited
   * from its ENABLED skills, dedupe (agent order first, keep-first, AC-19),
   * and read each fresh from the repo clone. A path that resolves outside the
   * clone, no longer exists, or exceeds the read cap is skipped (recorded in
   * the Live Log) rather than failing the run (AC-27, AC-28). Returns `[]`
   * when nothing is attached/inherited or the repo has no clone, in which
   * case the prompt is identical to the pre-lesson shape and the trace
   * records `spec_blocks: null` / `specs_read: []`.
   */
  private async buildSpecBlocks(
    repo: typeof schema.repos.$inferSelect,
    agent: AgentRow,
    runLog: RunLogger,
  ): Promise<SpecBlock[]> {
    if (!repo.clonePath) return [];
    const clonePath = repo.clonePath;

    let agentLinks, inherited;
    try {
      agentLinks = await this.container.contextRepo.listAgentContext(agent.id);
      inherited = await this.container.contextRepo.skillInheritedContext(agent.id);
    } catch (err) {
      runLog.info(`project context: failed to load attached docs — ${(err as Error).message}`);
      return [];
    }

    const paths = orderContextPaths(
      agentLinks.map((l) => l.path),
      inherited.map((l) => l.path),
    );
    if (paths.length === 0) return [];

    const blocks: SpecBlock[] = [];
    const skipped: string[] = [];
    for (const path of paths) {
      const full = resolveInClone(clonePath, path);
      if (!full) {
        skipped.push(path);
        continue;
      }
      let size: number;
      try {
        size = (await stat(full)).size;
      } catch {
        skipped.push(path);
        continue;
      }
      if (size > MAX_FILE_SIZE) {
        skipped.push(path);
        continue;
      }
      const content = await readFile(full, 'utf8').catch(() => null);
      if (content === null) {
        skipped.push(path);
        continue;
      }
      blocks.push({ path, tokens: this.container.tokenizer.count(content), body: content });
    }

    if (skipped.length > 0) {
      runLog.info(`project context: skipped ${skipped.length} missing/unsafe doc(s) — ${skipped.join(', ')}`);
    }
    if (blocks.length > 0) {
      const total = blocks.reduce((sum, b) => sum + b.tokens, 0);
      runLog.info(`project context: attached ${blocks.length} doc(s), ${total} token(s) total`);
    }
    return blocks;
  }

  /**
   * Build a compact "Callers of changed symbols" digest for the prompt.
   *
   * Returns `undefined` when nothing should be added (flag off, no callers
   * found, or repo-intel errors) — `reviewPullRequest` omits the section in
   * that case (acceptance #10: flag off → identical prompt).
   *
   * Compact format: one bullet per caller, grouped by file. Trimmed (limit 10
   * rows per `getCallerSignatures` call) so the section stays under ~600
   * tokens even on heavy PRs.
   */
  private async buildCallersDigest(
    repoId: string,
    diff: UnifiedDiff,
    runLog: RunLogger,
  ): Promise<string | undefined> {
    const changedFiles = diff.files.map((f) => f.path);
    if (changedFiles.length === 0) return undefined;
    let rows;
    try {
      rows = await this.container.repoIntel.getCallerSignatures(repoId, changedFiles, 10);
    } catch (err) {
      // Never let an enrichment break the run — surface only as a Live Log info.
      runLog.info(`callers digest: repoIntel failed — ${(err as Error).message}`);
      return undefined;
    }
    if (rows.length === 0) return undefined;

    const byFile = new Map<string, string[]>();
    for (const r of rows) {
      const lines = byFile.get(r.file) ?? [];
      lines.push(`- \`${r.symbol}\` — ${r.signature}`);
      byFile.set(r.file, lines);
    }
    const out: string[] = [];
    for (const [file, lines] of byFile) {
      out.push(`### ${file}`);
      out.push(...lines);
    }
    runLog.info(`callers digest: ${rows.length} caller signature(s) attached`);
    return out.join('\n');
  }

  /**
   * Build a compact PR-intent digest from the CACHED `pr_intent` row for the
   * prompt's `## PR intent` slot. DB-only (no model call): reads the row the
   * Intent feature already generated. Returns `undefined` when no intent exists
   * (or on any error) so the section is omitted and the prompt is identical to
   * the pre-intent shape. Errors never break the run — surfaced as a Live Log info.
   */
  private async buildIntentDigest(prId: string, runLog: RunLogger): Promise<string | undefined> {
    let row;
    try {
      row = await new IntentRepository(this.container.db).getByPr(prId);
    } catch (err) {
      runLog.info(`intent digest: failed to load cached intent — ${(err as Error).message}`);
      return undefined;
    }
    if (!row) return undefined;

    const lines = [`Intent: ${row.intent}`];
    if (row.inScope.length > 0) {
      lines.push('In scope:', ...row.inScope.map((s) => `- ${s}`));
    }
    if (row.outOfScope.length > 0) {
      lines.push('Out of scope:', ...row.outOfScope.map((s) => `- ${s}`));
    }
    if (row.risks.length > 0) {
      lines.push('Risk areas:', ...row.risks.map((r) => `- [${r.severity}] ${r.title}`));
    }
    runLog.info('intent digest: cached PR intent attached');
    return lines.join('\n');
  }

  /**
   * T3 — fetch the cached repo skeleton for the prompt's `## Repo skeleton`
   * slot. Returns `undefined` when repo-intel is off / the repo isn't indexed
   * (the facade degrades), so the prompt stays identical to the pre-T3 shape.
   */
  private async buildRepoMapDigest(
    repoId: string,
    runLog: RunLogger,
  ): Promise<string | undefined> {
    try {
      const map = await this.container.repoIntel.getRepoMap(repoId);
      if (map.degraded || map.text.trim().length === 0) return undefined;
      runLog.info(`repo map: ${map.tokens} token(s) attached (cached=${map.cached})`);
      return map.text;
    } catch (err) {
      runLog.info(`repo map: repoIntel failed — ${(err as Error).message}`);
      return undefined;
    }
  }

  /**
   * T3 — a one-line "N of M changed files are in the top 5% most-depended-on"
   * note appended to the task framing, so the model prioritises hot core files.
   * Empty string when repo-intel is off / no changed file is hot.
   */
  private async buildRankNote(
    repoId: string,
    diff: UnifiedDiff,
    runLog: RunLogger,
  ): Promise<string> {
    const changedFiles = diff.files.map((f) => f.path);
    if (changedFiles.length === 0) return '';
    try {
      const ranks = await this.container.repoIntel.getFileRank(repoId, changedFiles);
      if (ranks.length === 0) return '';
      const hot = ranks.filter((r) => r.percentile >= 95);
      if (hot.length === 0) return '';
      runLog.info(`file rank: ${hot.length}/${changedFiles.length} changed file(s) in top 5%`);
      return `\n\n${hot.length} of ${changedFiles.length} changed file(s) are in the top 5% most-depended-on (high blast risk) — prioritise their correctness.`;
    } catch {
      return '';
    }
  }

  /**
   * A minimal RunTrace whose `log` is the run's full SSE buffer — persisted on
   * failure/cancel (and pre-work failures) so the events (and WHY it failed)
   * survive a reload, not just the in-memory stream.
   */
  private traceFromBuffer(
    runId: string,
    pull: PullRow,
    agent: AgentRow,
    grounding: string,
    durationMs = 0,
  ): RunTrace {
    return {
      config: {
        agent: agent.name,
        version: String(agent.version),
        provider: agent.provider,
        model: agent.model,
        pr: pull.number,
        source: 'local',
      },
      stats: { duration_ms: durationMs, tokens_in: 0, tokens_out: 0, cost_usd: null, findings: 0, grounding },
      prompt_assembly: {
        system: agent.systemPrompt,
        skills: null,
        skill_blocks: null,
        memory: null,
        specs: null,
        spec_blocks: null,
        user: '',
      },
      tool_calls: [],
      raw_output: '',
      memory_pulled: [],
      specs_read: [],
      log: this.container.runBus.buffer(runId).map((e) => ({ t: e.t, kind: e.kind, msg: e.msg })),
    };
  }
}
```
