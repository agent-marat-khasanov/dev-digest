import type { Notifier, RunFinishedNotice } from './index.js';
import { withTimeout } from '../../platform/resilience.js';
import { ExternalServiceError } from '../../platform/errors.js';

const TIMEOUT_MS = 5_000;

/**
 * SlackWebhookNotifier — posts a one-line run summary to a Slack **incoming
 * webhook**. The URL is itself the credential, so it is resolved from the
 * SecretsProvider (`SLACK_WEBHOOK_URL`) in the composition root and handed in
 * here; it is never read from `process.env` at this layer and never logged.
 *
 * Message rendering lives here, not in the service: the port hands us a domain
 * `RunFinishedNotice` and this adapter is the only thing that knows Slack's
 * payload shape.
 */
export class SlackWebhookNotifier implements Notifier {
  constructor(private readonly webhookUrl: string) {}

  async runFinished(notice: RunFinishedNotice): Promise<void> {
    const res = await withTimeout(
      fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: renderText(notice) }),
      }),
      TIMEOUT_MS,
    );
    if (!res.ok) {
      // Slack returns the reason as plain text (e.g. "invalid_payload", "no_service").
      const detail = await res.text().catch(() => '');
      throw new ExternalServiceError(
        `Slack webhook failed (${res.status})${detail ? `: ${detail}` : ''}`,
      );
    }
  }
}

function renderText(notice: RunFinishedNotice): string {
  const { CRITICAL, WARNING, SUGGESTION } = notice.bySeverity;
  return (
    `DevDigest review finished — ${notice.repo} PR #${notice.prNumber}: ` +
    `${notice.totalFindings} finding(s) ` +
    `(${CRITICAL} critical, ${WARNING} warning, ${SUGGESTION} suggestion)`
  );
}
