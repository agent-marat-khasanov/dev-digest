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
