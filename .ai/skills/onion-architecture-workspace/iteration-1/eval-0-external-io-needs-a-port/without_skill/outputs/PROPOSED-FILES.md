# Proposed files (5)

## `server/.env.example`

```sh
# @devdigest/api environment
DATABASE_URL=postgres://devdigest:devdigest@localhost:5432/devdigest

# LLM providers (BYO key — entered via Settings UI in prod; env for local dev).
# Optional: the app boots with none. A key is only needed for the provider you
# actually run a review on (or embeddings, see EMBEDDINGS_ENABLED).
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OPENROUTER_API_KEY=

# GitHub (REST via Octokit) — PAT with repo scope. Canonical name is
# GITHUB_TOKEN; GITHUB_PAT is still accepted as a fallback for back-compat.
GITHUB_TOKEN=

# Slack incoming webhook (https://hooks.slack.com/services/…). Optional: when
# empty, run-finished notifications are simply OFF (the container wires a no-op
# Notifier) — the app makes ZERO Slack requests. Read through the SecretsProvider
# like the other secrets, so it can also be set at runtime in ~/.devdigest/secrets.json.
SLACK_WEBHOOK_URL=

# Memory/RAG embeddings (OpenAI text-embedding-3-small). Default OFF → the app
# makes ZERO OpenAI requests. Set true to enable memory retrieval.
EMBEDDINGS_ENABLED=false

# repo-intel facade (Tier 1: repo skeleton + callers in the review prompt).
# Default ON; set false to degrade every consumer to ripgrep-only behavior.
REPO_INTEL_ENABLED=true

API_PORT=3001
WEB_PORT=3000
NODE_ENV=development
# fatal | error | warn | info | debug | trace | silent (defaults: info, silent in test)
LOG_LEVEL=
DEVDIGEST_CLONE_DIR=./clones

# Comma-separated top-level folder names (exact segment match, any depth) the
# project-context discovery walk scans for .md docs.
CONTEXT_ROOTS=specs,docs,insights
```

## `server/src/adapters/index.ts`

```ts
/** Adapter barrel — real + mock implementations behind the adapter interfaces. */
export { LocalSecretsProvider } from './secrets/local.js';
export { LocalNoAuthProvider } from './auth/local.js';
export { OpenAIProvider } from './llm/openai.js';
export { AnthropicProvider } from './llm/anthropic.js';
export { OpenAIEmbedder } from './embedder/openai.js';
export { OctokitGitHubClient } from './github/octokit.js';
export { SimpleGitClient } from './git/simple-git.js';
export { parseUnifiedDiff } from './git/diff-parser.js';
export { RipgrepCodeIndex } from './codeindex/ripgrep.js';
export { estimateCost } from './llm/pricing.js';
export {
  type Notifier,
  type RunFinishedNotification,
  type SeverityCounts,
  NoopNotifier,
  SlackWebhookNotifier,
} from './notifier/index.js';
export * from './mocks.js';
```

## `server/src/adapters/notifier/index.ts`

```ts
/**
 * notifier adapter — outbound "a review run finished" notification.
 *
 * Port + impls live together, like the depgraph/tokenizer adapters: features
 * depend on the `Notifier` interface, the container decides which concrete to
 * build (Slack when a webhook URL is configured, no-op otherwise), and tests
 * inject their own via `ContainerOverrides.notifier`.
 *
 * The port speaks DOMAIN terms (repo / PR number / findings by severity) — the
 * Slack message shape (blocks, mrkdwn, `text`) is this file's private business,
 * so swapping Slack for Teams/Discord later touches nothing outside it.
 *
 * Robustness: a notification is a side-channel, never the point of the run.
 * `notifyRunFinished` NEVER throws — a dead webhook, a 500, or a timeout is
 * reported to the caller as `false` and the run completes as normal.
 */
import { withRetry, withTimeout } from '../../platform/resilience.js';
import type { Severity } from '@devdigest/shared';

/** Timeout for one webhook POST. Slack answers in ms; a hang must not linger. */
const WEBHOOK_TIMEOUT_MS = 5_000;

/** Findings of a finished run, bucketed by severity. Zero-filled — never sparse. */
export type SeverityCounts = Record<Severity, number>;

/** What the reviewer tells the outside world when one agent's run completes. */
export interface RunFinishedNotification {
  /** `owner/name` of the reviewed repo. */
  repo: string;
  /** PR number as it appears on GitHub. */
  prNumber: number;
  /** The agent whose run finished (a review fans out over several agents). */
  agent: string;
  /** Total findings the run produced (= sum of `bySeverity`). */
  findings: number;
  bySeverity: SeverityCounts;
}

export interface Notifier {
  /**
   * Announce a finished run. Best-effort: returns `true` when the notification
   * was delivered, `false` when it was dropped (not configured) or failed.
   * Never throws.
   */
  notifyRunFinished(n: RunFinishedNotification): Promise<boolean>;
}

/** Default when no webhook is configured: notifications are simply off. */
export class NoopNotifier implements Notifier {
  async notifyRunFinished(): Promise<boolean> {
    return false;
  }
}

/**
 * Slack incoming webhook (https://hooks.slack.com/services/…). The URL IS the
 * credential — it is resolved through the SecretsProvider in the container and
 * is never logged, echoed into a run trace, or returned in an error message.
 */
export class SlackWebhookNotifier implements Notifier {
  constructor(private readonly webhookUrl: string) {}

  async notifyRunFinished(n: RunFinishedNotification): Promise<boolean> {
    try {
      await withRetry(
        () => withTimeout(this.post(this.format(n)), WEBHOOK_TIMEOUT_MS),
        { retries: 2 },
      );
      return true;
    } catch {
      // Swallowed by contract — the caller logs; the run must not fail because
      // Slack is down. (No rethrow, and no `err` in scope to leak the URL.)
      return false;
    }
  }

  /**
   * One line of mrkdwn. Only repo/PR/agent/counts go over the wire — no model
   * output, no diff text, so there is nothing user-controlled to sanitize.
   */
  private format(n: RunFinishedNotification): string {
    const counts = [
      `${n.bySeverity.CRITICAL} critical`,
      `${n.bySeverity.WARNING} warning`,
      `${n.bySeverity.SUGGESTION} suggestion`,
    ].join(' · ');
    const headline =
      n.findings === 0
        ? 'no findings'
        : `${n.findings} finding${n.findings === 1 ? '' : 's'} (${counts})`;
    return `*DevDigest* — review of \`${n.repo}\` PR #${n.prNumber} by *${n.agent}* finished: ${headline}`;
  }

  private async post(text: string): Promise<void> {
    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      // Status only — the response body of a bad webhook can echo the URL back.
      const err = new Error(`Slack webhook returned ${res.status}`);
      // `withRetry`'s default predicate retries on 429/5xx — hand it the status.
      Object.assign(err, { status: res.status });
      throw err;
    }
  }
}
```

## `server/src/modules/reviews/run-executor.ts`

```ts
import { readFile, stat } from 'node:fs/promises';
import type { Container } from '../../platform/container.js';
import type { Provider, Review, RunTrace, Severity, SkillBlock, SpecBlock, UnifiedDiff } from '@devdigest/shared';
import { reviewPullRequest, countBlockers } from '@devdigest/reviewer-core';
import { RunLogger } from '../../platform/run-logger.js';
import * as schema from '../../db/schema.js';
import type { AgentRow } from '../../db/rows.js';
import type { ReviewRepository, FindingRow, PullRow, ReviewRow } from './repository.js';
import { REVIEW_STRATEGY } from './constants.js';
import { taskLine } from './helpers.js';
import { selectActiveSkillBlocks } from './skill-blocks.js';
import { orderContextPaths } from './context-blocks.js';
import { loadDiff } from './diff-loader.js';
import { IntentRepository } from '../intent/repository.js';
import { resolveInClone } from '../../platform/fs-guard.js';
import { MAX_FILE_SIZE } from '../repo-intel/constants.js';
import type { SeverityCounts } from '../../adapters/notifier/index.js';

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

/** Zero-filled severity buckets, so a notification never reports `undefined`. */
function countBySeverity(findings: FindingRow[]): SeverityCounts {
  const counts: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) counts[f.severity as Severity] += 1;
  return counts;
}

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

    for (const { agent, runId } of jobs) {
      const agentStart = Date.now();
      logger?.info(
        { runId, agent: agent.name, provider: agent.provider, model: agent.model, prId: pull.id },
        `review: agent "${agent.name}" started (${agent.provider}/${agent.model})`,
      );
      try {
        const outcome = await this.runOneAgent(workspaceId, pull, repo, diff, agent, runId, runLog);
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
      // prompt is identical to the pre-intent shape.
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

      // ---- Engine: assemble → single-pass → grounding -----------------------
      // The pure review pipeline lives in @devdigest/reviewer-core (shared with
      // the CI runner). The service owns only I/O: repo-intel context resolution
      // above, and persistence + observability below.
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

      // The run is DONE and durable at this point — the Slack ping is a
      // side-channel on top of it, not part of it. It is awaited (so the
      // process cannot exit mid-POST) but can never fail the run.
      await this.notifyRunFinished(pull, repo, agent, findingRows, runLog);

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
   * Post the run summary to the team's Slack webhook (repo, PR number, findings
   * split by severity). Fires once per FINISHED agent run — a run that failed or
   * was cancelled produced no findings and is not announced.
   *
   * Best-effort by construction: the Notifier resolves to a no-op when no
   * webhook is configured, and never throws. Any surprise is recorded in the
   * Live Log (like the other enrichments) and swallowed — a Slack outage must
   * never turn a green run red.
   */
  private async notifyRunFinished(
    pull: PullRow,
    repo: typeof schema.repos.$inferSelect,
    agent: AgentRow,
    findings: FindingRow[],
    runLog: RunLogger,
  ): Promise<void> {
    try {
      const notifier = await this.container.notifier();
      const sent = await notifier.notifyRunFinished({
        repo: `${repo.owner}/${repo.name}`,
        prNumber: pull.number,
        agent: agent.name,
        findings: findings.length,
        bySeverity: countBySeverity(findings),
      });
      if (sent) runLog.info('slack: run summary posted to the team webhook');
    } catch (err) {
      runLog.info(`slack: run summary not posted — ${(err as Error).message}`);
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

## `server/src/platform/container.ts`

```ts
import type {
  AuthProvider,
  SecretsProvider,
  GitHubClient,
  GitClient,
  CodeIndex,
  Embedder,
  LLMProvider,
} from '@devdigest/shared';
import type { AppConfig } from './config.js';
import type { Db } from '../db/client.js';
import { JobRunner } from './jobs.js';
import { runBus, type RunBus } from './sse.js';
import { LocalSecretsProvider } from '../adapters/secrets/local.js';
import { LocalNoAuthProvider } from '../adapters/auth/local.js';
import { OctokitGitHubClient } from '../adapters/github/octokit.js';
import { SimpleGitClient } from '../adapters/git/simple-git.js';
import { RipgrepCodeIndex } from '../adapters/codeindex/ripgrep.js';
import { OpenAIProvider } from '../adapters/llm/openai.js';
import { AnthropicProvider } from '../adapters/llm/anthropic.js';
import { OpenAIEmbedder } from '../adapters/embedder/openai.js';
import { OpenRouterProvider } from '@devdigest/reviewer-core';
import { estimateCost } from '../adapters/llm/pricing.js';
import { PriceBook } from './price-book.js';
import { ConfigError } from './errors.js';
import { AgentsRepository } from '../modules/agents/repository.js';
import { ReviewRepository } from '../modules/reviews/repository.js';
import { SkillsRepository } from '../modules/skills/repository.js';
import { ContextRepository } from '../modules/context/repository.js';
import { RepoRepository } from '../modules/repos/repository.js';
import type { RepoIntel } from '../modules/repo-intel/types.js';
import { RepoIntelService } from '../modules/repo-intel/service.js';
import { type DepGraph, DepCruiseGraph } from '../adapters/depgraph/index.js';
import { type Tokenizer, TiktokenTokenizer } from '../adapters/tokenizer/index.js';
import {
  type Notifier,
  NoopNotifier,
  SlackWebhookNotifier,
} from '../adapters/notifier/index.js';

/**
 * DI container. One per app instance. Holds config, db, the JobRunner,
 * the SSE bus, and lazily-constructed adapters resolved through SecretsProvider.
 *
 * Tests construct a container with `overrides` to inject mock adapters; the
 * Services depend on these interfaces, not the concrete classes.
 */
export interface ContainerOverrides {
  secrets?: SecretsProvider;
  auth?: AuthProvider;
  github?: GitHubClient;
  git?: GitClient;
  codeIndex?: CodeIndex;
  embedder?: Embedder;
  /** Pre-built providers by id (skip key lookup). */
  llm?: Partial<Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>>;
  /** repo-intel facade (T1.1+) — tests inject mock RepoIntel implementations. */
  repoIntel?: RepoIntel;
  /** repo-intel T3 adapters — only the indexer pipeline reads these. */
  depgraph?: DepGraph;
  tokenizer?: Tokenizer;
  /** Outbound run-finished notifications — tests inject a spy Notifier. */
  notifier?: Notifier;
}

export class Container {
  readonly config: AppConfig;
  readonly db: Db;
  readonly secrets: SecretsProvider;
  readonly auth: AuthProvider;
  readonly jobs: JobRunner;
  readonly runBus: RunBus;

  private _git?: GitClient;
  private _github?: GitHubClient;
  private _codeIndex?: CodeIndex;
  private _embedder?: Embedder;
  private llmCache = new Map<string, LLMProvider>();

  // Shared repositories for cross-cutting entities (agents, reviews/pulls,
  // runs). Constructed here, in the composition root, so consuming modules use
  // `container.agentsRepo` instead of reaching into another module's folder.
  private _agentsRepo?: AgentsRepository;
  private _reviewRepo?: ReviewRepository;
  private _skillsRepo?: SkillsRepository;
  private _contextRepo?: ContextRepository;
  private _repoRepo?: RepoRepository;
  private _repoIntel?: RepoIntel;
  private _depgraph?: DepGraph;
  private _tokenizer?: Tokenizer;
  private _priceBook?: PriceBook;
  private _notifier?: Notifier;

  constructor(config: AppConfig, db: Db, private overrides: ContainerOverrides = {}) {
    this.config = config;
    this.db = db;
    this.secrets = overrides.secrets ?? new LocalSecretsProvider(config.secretsPath);
    this.auth = overrides.auth ?? new LocalNoAuthProvider(db);
    this.runBus = runBus;
    this.jobs = new JobRunner(db);
  }

  get git(): GitClient {
    if (this.overrides.git) return this.overrides.git;
    this._git ??= new SimpleGitClient(this.config.cloneDir);
    return this._git;
  }

  get agentsRepo(): AgentsRepository {
    return (this._agentsRepo ??= new AgentsRepository(this.db));
  }

  get reviewRepo(): ReviewRepository {
    return (this._reviewRepo ??= new ReviewRepository(this.db));
  }

  get skillsRepo(): SkillsRepository {
    return (this._skillsRepo ??= new SkillsRepository(this.db));
  }

  /** agent_context/skill_context link table access (paths-only attachments). */
  get contextRepo(): ContextRepository {
    return (this._contextRepo ??= new ContextRepository(this.db));
  }

  get repoRepo(): RepoRepository {
    return (this._repoRepo ??= new RepoRepository(this.db));
  }

  get codeIndex(): CodeIndex {
    if (this.overrides.codeIndex) return this.overrides.codeIndex;
    this._codeIndex ??= new RipgrepCodeIndex(this.git);
    return this._codeIndex;
  }

  /**
   * The repo-intel facade (T1.1). All higher-level features (reviews,
   * blast/onboarding migrations, phantom-gate) code against this interface.
   * Tests inject a mock via `ContainerOverrides.repoIntel`.
   */
  get repoIntel(): RepoIntel {
    if (this.overrides.repoIntel) return this.overrides.repoIntel;
    this._repoIntel ??= new RepoIntelService(this);
    return this._repoIntel;
  }

  /** Import-graph builder (dependency-cruiser). T3 indexer pipeline only. */
  get depgraph(): DepGraph {
    if (this.overrides.depgraph) return this.overrides.depgraph;
    this._depgraph ??= new DepCruiseGraph();
    return this._depgraph;
  }

  /** Token counter (js-tiktoken) for the repo-map budget search. */
  get tokenizer(): Tokenizer {
    if (this.overrides.tokenizer) return this.overrides.tokenizer;
    this._tokenizer ??= new TiktokenTokenizer();
    return this._tokenizer;
  }

  /**
   * Live OpenRouter pricing for cost attribution. The lister builds a bare
   * OpenRouter provider just for `/models` (no estimator needed) and degrades to
   * `[]` when no key is configured; the static `estimateCost` table is the
   * fallback for OpenAI/Anthropic and a cold/cold-failed cache.
   */
  get priceBook(): PriceBook {
    this._priceBook ??= new PriceBook(async () => {
      try {
        const key = await this.secrets.get('OPENROUTER_API_KEY');
        if (!key) return [];
        return await new OpenRouterProvider(key).listModels();
      } catch {
        return [];
      }
    }, estimateCost);
    return this._priceBook;
  }

  async github(): Promise<GitHubClient> {
    if (this.overrides.github) return this.overrides.github;
    if (this._github) return this._github;
    const token = await this.secrets.get('GITHUB_TOKEN');
    if (!token) throw new ConfigError('GITHUB_TOKEN is not configured');
    this._github = new OctokitGitHubClient(token);
    return this._github;
  }

  /**
   * Outbound run-finished notifications. The webhook URL is a SECRET, so it is
   * resolved through the SecretsProvider (`~/.devdigest/secrets.json`, env
   * fallback) — exactly like GITHUB_TOKEN — never via AppConfig.
   *
   * Unlike `github()`, a missing URL is NOT an error: notifications are opt-in,
   * so we degrade to `NoopNotifier` and every call site behaves as if the
   * feature did not exist. Cached like the other secret-derived clients and
   * dropped by `invalidateSecretCaches()` when the URL is (re)entered.
   */
  async notifier(): Promise<Notifier> {
    if (this.overrides.notifier) return this.overrides.notifier;
    if (this._notifier) return this._notifier;
    const url = await this.secrets.get('SLACK_WEBHOOK_URL');
    this._notifier = url ? new SlackWebhookNotifier(url) : new NoopNotifier();
    return this._notifier;
  }

  /** Resolve an LLM provider by id; constructs from the secret key, cached. */
  async llm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    const injected = this.overrides.llm?.[id];
    if (injected) return injected;
    const cached = this.llmCache.get(id);
    if (cached) return cached;
    const provider = await this.buildLlm(id);
    this.llmCache.set(id, provider);
    return provider;
  }

  private async buildLlm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    if (id === 'openai') {
      const key = await this.secrets.get('OPENAI_API_KEY');
      if (!key) throw new ConfigError('OPENAI_API_KEY is not configured');
      return new OpenAIProvider(key);
    }
    if (id === 'openrouter') {
      // Single OpenRouter provider lives in reviewer-core (shared with the CI
      // runner); inject the PriceBook so cost attribution uses LIVE OpenRouter
      // prices (with the static table as a fallback) rather than a hardcoded one.
      const key = await this.secrets.get('OPENROUTER_API_KEY');
      if (!key) throw new ConfigError('OPENROUTER_API_KEY is not configured');
      return new OpenRouterProvider(key, {
        estimateCost: (model, tokensIn, tokensOut) =>
          this.priceBook.estimate(model, tokensIn, tokensOut),
      });
    }
    const key = await this.secrets.get('ANTHROPIC_API_KEY');
    if (!key) throw new ConfigError('ANTHROPIC_API_KEY is not configured');
    return new AnthropicProvider(key);
  }

  async embedder(): Promise<Embedder> {
    // Injected embedders (tests) always win. Otherwise embeddings are gated by
    // config: when disabled we throw BEFORE constructing the OpenAI client, so
    // the app makes ZERO OpenAI requests. All callers wrap this in try/catch and
    // degrade gracefully (memory/RAG simply returns no hits).
    if (this.overrides.embedder) return this.overrides.embedder;
    if (!this.config.embeddingsEnabled) {
      throw new ConfigError('Embeddings are disabled (set EMBEDDINGS_ENABLED=true to enable memory/RAG)');
    }
    if (this._embedder) return this._embedder;
    const openai = await this.llm('openai');
    this._embedder = new OpenAIEmbedder(openai);
    return this._embedder;
  }

  /**
   * Drop cached provider clients so the next resolve picks up changed secrets.
   * Call after persisting a new API key/PAT via SecretsProvider.set.
   */
  invalidateSecretCaches(): void {
    this.llmCache.clear();
    this._github = undefined;
    this._embedder = undefined;
    this._notifier = undefined;
  }
}
```
