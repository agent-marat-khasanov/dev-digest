/**
 * notify adapter — the port + its barrel.
 *
 * `Notifier` is a SERVER-LOCAL port: only `platform/container.ts`, the review
 * run-executor and the adapters below ever name it, so it is declared here
 * beside its implementation rather than in `vendor/shared/adapters.ts` (which is
 * hand-synced into `client/` and read by `reviewer-core` — nothing outside
 * `server/` needs this type).
 *
 * The port speaks in DOMAIN terms only ("a review run finished with N findings
 * of these severities") — no Slack, no webhook, no HTTP. Rendering that notice
 * into a vendor payload is the adapter's job, so swapping Slack for e-mail or a
 * queue touches only `adapters/notify/*` + one line in the container.
 */
import type { Severity } from '@devdigest/shared';

/** What a finished review run reports outward. Vendor-neutral by design. */
export interface RunFinishedNotice {
  /** "owner/name" of the reviewed repository. */
  repo: string;
  /** PR number the run reviewed. */
  prNumber: number;
  /** Findings the run persisted (post-grounding). */
  totalFindings: number;
  /** The same findings split by severity — always all three keys. */
  bySeverity: Record<Severity, number>;
}

export interface Notifier {
  runFinished(notice: RunFinishedNotice): Promise<void>;
}

export { SlackWebhookNotifier } from './slack.js';
