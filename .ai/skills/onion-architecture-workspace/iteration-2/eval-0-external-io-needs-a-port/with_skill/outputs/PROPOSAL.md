# Proposal — Slack run-finished notification

Post a one-line summary (repo, PR number, findings split by severity) to a Slack incoming webhook
when a review run finishes. External I/O, so it reaches the outside world through a **port** resolved
from the `Container` — not a `fetch()` inside a service.

## Files

| Repo-relative path | New / modified | What goes in it, and why it belongs there |
|---|---|---|
| `server/src/adapters/notify/index.ts` | **new** | The **port**: `Notifier` (`runFinished(notice)`) + the vendor-neutral `RunFinishedNotice` (repo slug, PR number, total findings, `bySeverity`). Server-local — only `container.ts`, the run-executor and the adapters name it — so per the skill's *"does any package outside `server/` have to name this type?"* test it is declared **beside its adapter**, not in `vendor/shared/adapters.ts` (which is hand-synced into `client/` and read by `reviewer-core`; parking a server-only port there widens that surface for nothing). Re-exports the adapter as the folder barrel. |
| `server/src/adapters/notify/slack.ts` | **new** | The **adapter**: `SlackWebhookNotifier implements Notifier`. Infrastructure — the only file that knows Slack exists, owns the HTTP `POST`, the `{ text }` payload shape and the message wording. Takes the webhook URL as a constructor arg (never reads `process.env` itself), wraps the call in the existing `withTimeout` and throws `ExternalServiceError` on a non-2xx, like the other outbound adapters. |
| `server/src/adapters/mocks.ts` | modified | Adds `MockNotifier implements Notifier`, recording notices in `sent[]`. Step 3 of the skill's add-an-adapter recipe: every port gets a no-network mock so run tests can assert the notification without touching Slack. |
| `server/src/adapters/index.ts` | modified | Barrel export of `SlackWebhookNotifier` + the port types, consistent with the other adapters. |
| `server/src/platform/container.ts` | modified | **Composition root** — the only place allowed to construct the concrete. Adds `notifier?: Notifier` to `ContainerOverrides` and an async `notifier(): Promise<Notifier \| null>` that reads `SLACK_WEBHOOK_URL` from the `SecretsProvider` (the webhook URL *is* a credential, so it comes from secrets like every other key — not `AppConfig`), memoizes the result, and returns `null` when nothing is configured. Also clears the cached notifier in `invalidateSecretCaches()` so a webhook saved at runtime is picked up. Returning `null` (rather than throwing `ConfigError` like `github()`) is deliberate: notifications are an optional side-channel, and "not configured" is the normal state, not a failure. |
| `server/src/modules/reviews/helpers.ts` | modified | Adds the pure `runFinishedNotice(repo, pull, findings)` — **boundary mapping**, the same job `reviewToDto` already does here: rows + engine `Finding[]` in, domain `RunFinishedNotice` out (severity tallied into `{ CRITICAL, WARNING, SUGGESTION }`). Side-effect free and unit-testable on its own; it does not know Slack exists. |
| `server/src/modules/reviews/run-executor.ts` | modified | **Application layer** — where a run actually ends. After the review + findings are persisted, `agent_runs` is completed, the trace is saved and the SSE bus is closed, `notifyRunFinished()` resolves the port via `this.container.notifier()` and posts the mapped notice. Best-effort, mirroring the repo-intel enrichments: no notifier → silent no-op; a failed post is recorded in the Live Log and never fails a run that already succeeded. |
| `server/.env.example` | modified | Documents `SLACK_WEBHOOK_URL` next to the other BYO secrets, noting that `~/.devdigest/secrets.json` takes precedence and that an empty value disables notifications. |

Deliberately **not** touched: `server/src/vendor/shared/adapters.ts` (`SecretKey` is already an open union — `'…' | (string & {})` — so `SLACK_WEBHOOK_URL` needs no edit to that hand-synced file, exactly as `OPENROUTER_API_KEY` needs none), the Zod contracts, and the settings `test-connection` flow (adding a Slack tile there would mean changing the shared `ConnTestProvider` enum + the client — beyond what was asked).

## How the pieces call each other at run time

`ReviewService.runReview` fires `ReviewRunExecutor.executeRuns` in the background; that loops over the
queued agents and calls `runOneAgent` once per run. At the tail of a **successful** `runOneAgent` — after
`insertReview` / `insertFindings`, `completeAgentRun`, `saveRunTrace` and `runBus.complete(runId)` — the
executor calls its private `notifyRunFinished(repo, pull, keptFindings, runLog)`. That asks the
composition root for the port (`await this.container.notifier()`); the container reads
`SLACK_WEBHOOK_URL` once from the `SecretsProvider`, and either memoizes a `SlackWebhookNotifier(url)`
or memoizes `null` when no webhook is configured (in which case the executor simply returns and the run
is byte-for-byte what it was before). With a notifier in hand, the executor maps its in-memory data to a
domain notice via the pure `runFinishedNotice(repo, pull, findings)` helper — `owner/name`, `pull.number`,
the total, and the per-severity tally — and awaits `notifier.runFinished(notice)`. Only inside
`SlackWebhookNotifier` does the notice become Slack: it renders the one-line text, `POST`s
`{ text }` as JSON to the webhook under a 5s `withTimeout`, and throws `ExternalServiceError` on a
non-2xx. The executor catches anything thrown, writes one `notify: …` line into the run's Live Log, and
returns normally — the review is already durable, so a broken webhook degrades to a log line. In tests,
`ContainerOverrides.notifier = new MockNotifier()` swaps the whole outbound leg with zero changes inward:
the dependency arrow runs executor → `Notifier` ← `SlackWebhookNotifier`, and only `container.ts` ever
names the concrete class.
