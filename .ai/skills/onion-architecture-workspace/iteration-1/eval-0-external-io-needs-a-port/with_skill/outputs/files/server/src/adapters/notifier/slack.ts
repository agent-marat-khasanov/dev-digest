import type { Notifier, ReviewRunSummary } from '@devdigest/shared';
import { withRetry, withTimeout } from '../../platform/resilience.js';
import { ExternalServiceError } from '../../platform/errors.js';

const TIMEOUT = 5_000;

/**
 * Slack rejects an incoming-webhook message whose text contains raw `&`, `<`
 * or `>` (they delimit its markup) — escape them, and only them.
 */
function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Non-2xx from the webhook. Carries the HTTP status so `withRetry`'s default
 *  retry predicate retries 429/5xx and gives up immediately on a 4xx. */
class SlackWebhookError extends ExternalServiceError {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`Slack webhook rejected the message (HTTP ${status}): ${body.slice(0, 200)}`);
  }
}

/** The one-line summary posted when a review run finishes. */
export function formatRunSummary(summary: ReviewRunSummary): string {
  const { CRITICAL, WARNING, SUGGESTION } = summary.bySeverity;
  const total = CRITICAL + WARNING + SUGGESTION;
  const repo = escape(`${summary.repo.owner}/${summary.repo.name}`);
  return (
    `Review finished — *${repo}* PR #${summary.prNumber}: ` +
    `${total} finding${total === 1 ? '' : 's'} ` +
    `(${CRITICAL} critical, ${WARNING} warning, ${SUGGESTION} suggestion)`
  );
}

/**
 * Notifier over a Slack incoming webhook (plain `POST { text }`). The webhook
 * URL is a secret — it is resolved from SecretsProvider in the composition root
 * and handed to this adapter; nothing else in the app knows the URL, or that
 * the chat vendor is Slack at all.
 */
export class SlackNotifier implements Notifier {
  readonly id = 'slack';

  constructor(private readonly webhookUrl: string) {}

  async reviewRunFinished(summary: ReviewRunSummary): Promise<void> {
    const body = JSON.stringify({ text: formatRunSummary(summary) });
    await withRetry(() => withTimeout(this.post(body), TIMEOUT));
  }

  private async post(body: string): Promise<void> {
    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    if (!res.ok) throw new SlackWebhookError(res.status, await res.text());
  }
}
