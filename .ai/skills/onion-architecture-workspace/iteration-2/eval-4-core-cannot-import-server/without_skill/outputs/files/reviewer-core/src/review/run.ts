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
import { reduceReviews, scoreFromFindings, sliceDiff } from './reduce.js';

/**
 * reviewPullRequest — the review engine entry point.
 *
 * given (diff + resolved agent inputs + injected LLM) → grounded Review.
 *
 * This is the pure core lifted out of the server's `ReviewService.runOneAgent`:
 * assemble prompt → single-pass OR map-reduce per file → reduce → SHARED
 * citation-grounding gate. It performs NO I/O beyond the injected LLM provider
 * (no DB, GitHub, fs, memory retrieval, intent, or persistence) — those stay in
 * the caller (server persists + streams SSE; runner posts + writes an artifact).
 *
 * Skill bodies / memory / specs are RESOLVED strings here: the caller turns
 * AgentManifest skill slugs into bodies (DB in the studio, fs in the runner).
 */

/** Default map-reduce threshold (matches the server's FILE_MAP_THRESHOLD_LINES). */
export const DEFAULT_MAP_THRESHOLD_LINES = 400;
/** Default structured-output reprompt retries (matches REVIEW_MAX_RETRIES). */
export const DEFAULT_REVIEW_MAX_RETRIES = 2;

export type ReviewStrategy = 'auto' | 'single-pass' | 'map-reduce';
export type ReviewMode = 'single-pass' | 'map-reduce';

/**
 * The pipeline stage the engine is currently on.
 *
 * A long review is mostly spent inside ONE provider call, so without a stage
 * marker at each boundary the caller's log goes silent and the run looks frozen.
 * The engine emits a stage-tagged event as it ENTERS each stage (in particular
 * `llm_called` is emitted BEFORE the call, not after it), so the UI can show
 * what is being waited on.
 *
 * The engine cannot reach the outside world — it only calls `onEvent`. The stage
 * rides on that event's `data` payload, which the caller forwards verbatim (the
 * server hands it to its run bus → SSE → Live Log). Nothing here knows about
 * SSE, the run bus, Fastify, or the DB.
 */
export type ReviewStage = 'diff_parsed' | 'prompt_assembled' | 'llm_called' | 'findings_grounded';

/**
 * Progress event emitted during a review (server → SSE bus, runner → log).
 *
 * `data` is an opaque payload the caller forwards as-is. On the events that mark
 * a pipeline boundary it carries `{ stage: ReviewStage, ... }` (see `ReviewStage`).
 */
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
  /** Progress sink. Stage boundaries arrive here with `data.stage` set. */
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

/** Total changed lines across the diff (drives the map-reduce decision + the parsed-diff event). */
function changedLineCount(diff: UnifiedDiff): number {
  return diff.files.reduce((n, f) => n + f.additions + f.deletions, 0);
}

function selectMode(strategy: ReviewStrategy, diff: UnifiedDiff, threshold: number): ReviewMode {
  if (strategy === 'single-pass') return 'single-pass';
  if (strategy === 'map-reduce') return diff.files.length > 1 ? 'map-reduce' : 'single-pass';
  // auto: map-reduce only when the diff is both large AND multi-file (else 1 call).
  return changedLineCount(diff) > threshold && diff.files.length > 1 ? 'map-reduce' : 'single-pass';
}

export async function reviewPullRequest(input: ReviewInput): Promise<ReviewOutcome> {
  const threshold = input.mapThresholdLines ?? DEFAULT_MAP_THRESHOLD_LINES;
  const maxRetries = input.maxRetries ?? DEFAULT_REVIEW_MAX_RETRIES;
  const mode = selectMode(input.strategy ?? 'auto', input.diff, threshold);
  const emit = (kind: RunEventKind, msg: string, data?: unknown) =>
    input.onEvent?.({ kind, msg, data });
  /** Emit a stage boundary: the machine-readable `stage` rides on `data`, next to any extra payload. */
  const emitStage = (
    stage: ReviewStage,
    kind: RunEventKind,
    msg: string,
    data: Record<string, unknown> = {},
  ) => emit(kind, msg, { stage, ...data });

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

  // Stage 1 — the diff we were handed is parsed; report its shape and the path
  // we picked. Emitted FIRST (before any assembly) so the log moves immediately.
  const fileCount = input.diff.files.length;
  const changedLines = changedLineCount(input.diff);
  emitStage(
    'diff_parsed',
    'info',
    mode === 'map-reduce'
      ? `Diff parsed — ${fileCount} changed file(s), ${changedLines} changed line(s); large diff → map-reduce`
      : `Diff parsed — ${fileCount} changed file(s), ${changedLines} changed line(s); reviewing in one pass`,
    { files: fileCount, changedLines, mode },
  );

  // Whole-diff assembly is the trace default; overwritten below for single-pass.
  let assembly: PromptAssembly = assemblePrompt({ ...promptParts, diff: input.diff.raw }).assembly;

  const chunks =
    mode === 'map-reduce'
      ? input.diff.files.map((f) => ({ label: f.path, diffText: sliceDiff(input.diff, f.path) }))
      : [{ label: 'all files', diffText: input.diff.raw }];

  const partials: Review[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd: number | null = 0;
  const raws: string[] = [];

  for (const chunk of chunks) {
    // Cancellation checkpoint — stop before the next (expensive) LLM call.
    input.checkCancelled?.();

    // Stage 2 — prompt assembled for this chunk. Assembly is pure + cheap, but in
    // map-reduce it repeats per file, so the log shows progress through the files.
    const a = assemblePrompt({ ...promptParts, diff: chunk.diffText });
    if (mode === 'single-pass') assembly = a.assembly;
    const promptChars = a.messages.reduce((n, m) => n + m.content.length, 0);
    emitStage('prompt_assembled', 'info', `Prompt assembled for ${chunk.label} — ${promptChars} chars`, {
      file: chunk.label,
      chars: promptChars,
    });

    // Stage 3 — the LLM call. Emitted BEFORE the call: this is the stage the run
    // sits in for most of its wall-clock time, so the Live Log must name the model
    // it is waiting on rather than going silent.
    // 'map:' prefix only for the map-reduce path (one call per file). In
    // single-pass there is exactly one chunk (the whole diff) — don't mislabel it.
    emitStage(
      'llm_called',
      'tool',
      mode === 'map-reduce'
        ? `map: reviewing ${chunk.label} — calling ${input.model}…`
        : `Reviewing ${chunk.label} in one pass — calling ${input.model}…`,
      { file: chunk.label, model: input.model },
    );

    const t0 = Date.now();
    const res = await input.llm.completeStructured<Review>({
      model: input.model,
      schema: ReviewSchema,
      schemaName: 'Review',
      messages: a.messages,
      maxRetries,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    });
    const elapsedMs = Date.now() - t0;
    tokensIn += res.tokensIn;
    tokensOut += res.tokensOut;
    costUsd = costUsd == null || res.costUsd == null ? null : costUsd + res.costUsd;
    raws.push(res.raw);
    partials.push(res.data);
    // Closes the llm_called stage: how long the model actually took is the answer
    // to "is it frozen?", so it goes in the message.
    emit(
      'result',
      `${chunk.label}: ${res.data.findings.length} candidate finding(s) in ${(elapsedMs / 1000).toFixed(1)}s`,
    );
  }

  const merged = reduceReviews(partials);
  emit(
    'result',
    `Reduced to ${merged.findings.length} finding(s); verdict=${merged.verdict}, score=${merged.score}`,
  );

  // Stage 4 — SHARED citation-grounding gate (the only post-step; not duplicated
  // per strategy).
  const ground = groundFindings(merged.findings, input.diff);
  const grounding = groundingSummary(ground);
  for (const d of ground.dropped) {
    emit('info', `grounding dropped "${d.finding.title}": ${d.reason}`);
  }
  emitStage('findings_grounded', 'result', `Citation grounding: ${grounding}`, {
    kept: ground.kept.length,
    dropped: ground.dropped.length,
  });

  // Score is derived from the findings that SURVIVED grounding (not the model's
  // self-reported number, and not the pre-grounding set) so the score, the
  // findings list, and the deterministic event always agree.
  return {
    review: { ...merged, findings: ground.kept, score: scoreFromFindings(ground.kept) },
    grounding,
    dropped: ground.dropped,
    mode,
    assembly,
    chunks: chunks.map((c) => ({ label: c.label })),
    tokensIn,
    tokensOut,
    costUsd,
    raw: raws.join('\n---\n'),
  };
}
