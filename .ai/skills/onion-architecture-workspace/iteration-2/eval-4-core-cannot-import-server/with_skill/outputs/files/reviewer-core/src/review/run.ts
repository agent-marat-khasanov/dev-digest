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
 * The pipeline stage a `ReviewEvent` reports, in the order the engine reaches
 * them. This is the engine's OWN progress vocabulary — a caller-facing label,
 * not a wire contract: the server tags its run events with it (Live Log), the
 * CI runner can print it. The core keeps no notion of runs, SSE, or buses;
 * stages leave through the injected `onEvent` sink and nothing else.
 *
 * - `diff-parsed`       — the diff is ingested; file/line counts + mode known.
 * - `prompt-assembled`  — the messages for one chunk are built (once per LLM call).
 * - `llm-called`        — a model call is about to go out (the long, silent part).
 * - `findings-grounded` — the citation-grounding gate has run; findings are final.
 *
 * In map-reduce, `prompt-assembled` / `llm-called` fire once per file chunk.
 */
export type ReviewStage = 'diff-parsed' | 'prompt-assembled' | 'llm-called' | 'findings-grounded';

/** Progress event emitted during a review (server → SSE bus, runner → log). */
export interface ReviewEvent {
  kind: RunEventKind;
  msg: string;
  /** Set on the events that mark a pipeline stage boundary; absent on chatter. */
  stage?: ReviewStage;
  data?: Record<string, unknown>;
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
  /**
   * Progress sink — the ONLY way the engine reports outward. Stage events are
   * emitted as they happen (not batched at the end), so a caller that streams
   * them (the server's RunLogger → run bus → SSE → Live Log) shows the run
   * moving in real time. The core knows nothing about the sink's destination.
   */
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
  const emit = (kind: RunEventKind, msg: string, data?: Record<string, unknown>) =>
    input.onEvent?.({ kind, msg, data });
  /** Emit a stage-boundary event: same sink, plus the machine-readable stage. */
  const stage = (
    s: ReviewStage,
    kind: RunEventKind,
    msg: string,
    data?: Record<string, unknown>,
  ) => input.onEvent?.({ kind, msg, stage: s, data });

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

  // STAGE 1 — diff parsed. Carries the two facts that explain everything that
  // follows: how big the diff is, and which path the engine picked.
  const changedLines = input.diff.files.reduce((n, f) => n + f.additions + f.deletions, 0);
  stage(
    'diff-parsed',
    'info',
    `Diff parsed — ${input.diff.files.length} changed file(s), ${changedLines} changed line(s); ` +
      (mode === 'map-reduce'
        ? `large diff → map-reduce over ${chunks.length} file(s)`
        : 'reviewing in one pass'),
    { files: input.diff.files.length, lines: changedLines, mode, chunks: chunks.length },
  );

  const partials: Review[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd: number | null = 0;
  const raws: string[] = [];

  for (const [i, chunk] of chunks.entries()) {
    // Cancellation checkpoint — stop before the next (expensive) LLM call.
    input.checkCancelled?.();

    // STAGE 2 — prompt assembled (once per model call; per file in map-reduce).
    // Size is reported in CHARS, not tokens: counting tokens would need a
    // tokenizer, and that dependency lives on the server's outer ring
    // (adapters/tokenizer) — the core does not reach for it.
    const a = assemblePrompt({ ...promptParts, diff: chunk.diffText });
    if (mode === 'single-pass') assembly = a.assembly;
    const promptChars = a.messages.reduce((n, m) => n + m.content.length, 0);
    stage(
      'prompt-assembled',
      'info',
      `Prompt assembled for ${chunk.label} — ${a.messages.length} message(s), ${promptChars} chars`,
      { chunk: chunk.label, messages: a.messages.length, chars: promptChars },
    );

    // STAGE 3 — LLM called. Emitted BEFORE the await: this is the long, silent
    // stretch that made the UI look frozen, so the Live Log must show it the
    // moment it starts, not once it returns. 'tool' = external I/O (amber).
    stage(
      'llm-called',
      'tool',
      mode === 'map-reduce'
        ? `map: calling ${input.model} on ${chunk.label} (${i + 1}/${chunks.length})`
        : `Calling ${input.model} on ${chunk.label} in one pass`,
      { file: chunk.label, model: input.model, chunk: i + 1, of: chunks.length },
    );
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
  // STAGE 4 — findings grounded. The gate has run; the findings are final.
  stage('findings-grounded', 'result', `Citation grounding: ${grounding}`, {
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
