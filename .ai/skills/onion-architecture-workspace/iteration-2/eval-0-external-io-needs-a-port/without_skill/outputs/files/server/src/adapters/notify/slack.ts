/**
 * notify adapter — Slack incoming webhook.
 *
 * The `Notifier` port is what feature code depends on: the review run executor
 * hands it a domain-shaped notice ("this run finished with N findings") and
 * knows nothing about Slack, webhooks, or mrkdwn. Swap in a different backend
 * (Teams, e-mail, a queue) by implementing this interface; tests inject one via
 * `ContainerOverrides.notifier`.
 *
 * The webhook URL is a SECRET, so it is resolved through SecretsProvider (env
 * or ~/.devdigest/secrets.json), never from AppConfig — same rule as the LLM /
 * GitHub keys. It is resolved on EVERY send (a closure, not a constructor
 * argument) so a key added at runtime takes effect without invalidating caches.
 *
 * Not configured → `reviewFinished` is a silent no-op, so the app boots and
 * reviews run exactly as before when no webhook is set (matching "no keys
 * required to boot").
 */
import type { Severity } from '@devdigest/shared';
import { withRetry, withTimeout } from '../../platform/resilience.js';

/** Short — a run must not stall on a hanging webhook (the review is already persisted). */
const TIMEOUT = 5_000;
const RETRIES = 1;

/** What the domain knows about a finished run — no Slack vocabulary here. */
export interface ReviewFinishedNotice {
  /** "owner/name" of the reviewed repo. */
  repo: string;
  prNumber: number;
  /** The agent that produced the run — one run = one agent, so this disambiguates. */
  agentName: string;
  findings: number;
  bySeverity: Record<Severity, number>;
}

export interface Notifier {
  /** Announce a finished review run. No-op when no channel is configured. */
  reviewFinished(notice: ReviewFinishedNotice): Promise<void>;
}

/** Slack requires these three characters escaped in message text. */
function escapeSlack(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const SEVERITY_LABEL: Record<Severity, string> = {
  CRITICAL: 'critical',
  WARNING: 'warning',
  SUGGESTION: 'suggestion',
};

/**
 * One-line mrkdwn summary. Repo/agent names come from user data, so they are
 * escaped; the counts are ours. Severities with a zero count are omitted.
 */
export function formatReviewFinished(n: ReviewFinishedNotice): string {
  const breakdown = (Object.keys(SEVERITY_LABEL) as Severity[])
    .filter((s) => n.bySeverity[s] > 0)
    .map((s) => `${n.bySeverity[s]} ${SEVERITY_LABEL[s]}`)
    .join(' · ');
  const counts = n.findings === 0 ? 'no findings' : `${n.findings} finding(s) — ${breakdown}`;
  return `*${escapeSlack(n.repo)} #${n.prNumber}* — review by "${escapeSlack(n.agentName)}" finished: ${counts}`;
}

export class SlackWebhookNotifier implements Notifier {
  /** `webhookUrl` is a resolver so the secret is read fresh on every send. */
  constructor(private readonly webhookUrl: () => Promise<string | undefined>) {}

  async reviewFinished(notice: ReviewFinishedNotice): Promise<void> {
    const url = await this.webhookUrl();
    if (!url) return;

    const body = JSON.stringify({ text: formatReviewFinished(notice) });
    await withRetry(
      () =>
        withTimeout(
          (async () => {
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body,
            });
            if (!res.ok) {
              // `status` is what resilience's default isRetryable reads (429/5xx).
              throw Object.assign(new Error(`Slack webhook returned ${res.status}`), {
                status: res.status,
              });
            }
          })(),
          TIMEOUT,
        ),
      { retries: RETRIES },
    );
  }
}
