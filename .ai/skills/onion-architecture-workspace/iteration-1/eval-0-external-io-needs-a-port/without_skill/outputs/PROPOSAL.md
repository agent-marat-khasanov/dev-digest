# Proposal — Slack run-finished notification

Post a one-line summary (repo, PR number, findings split by severity) to a team Slack incoming
webhook when a review run finishes.

## Files

| repo-relative path | new / modified | what goes in it and why it belongs there |
|---|---|---|
| `server/src/adapters/notifier/index.ts` | **new** | The `Notifier` port + its two impls (`SlackWebhookNotifier`, `NoopNotifier`) and the `RunFinishedNotification` / `SeverityCounts` payload types. Slack is external I/O, so it must sit behind an interface in `adapters/` — the same shape the `depgraph` and `tokenizer` adapters already use (port declared next to its concrete, wired through the container, swappable via `ContainerOverrides`). The port speaks domain terms (repo / PR number / counts); the Slack wire format (`{ text }`, mrkdwn) never escapes this file, so swapping Slack for Teams later touches nothing else. `notifyRunFinished` never throws — it returns `true`/`false` — because a notification is a side-channel, not part of the run. |
| `server/src/adapters/index.ts` | modified | One line in the adapter barrel exporting the new port + impls, matching how every other adapter is re-exported. |
| `server/src/platform/container.ts` | modified | Composition root: an `async notifier()` resolver + a `notifier?` override slot + a cache-drop in `invalidateSecretCaches()`. It reads `SLACK_WEBHOOK_URL` through `this.secrets` (the `SecretsProvider`), mirroring `github()`. The one deliberate difference: a missing URL is **not** a `ConfigError` — notifications are opt-in, so it degrades to `NoopNotifier` and the feature is invisible when unconfigured. This is the only file that names `SlackWebhookNotifier`. |
| `server/src/modules/reviews/run-executor.ts` | modified | The firing point. `runOneAgent` already owns "a run finished": after `completeAgentRun` + `saveRunTrace`, a new private `notifyRunFinished(...)` builds the payload (repo `owner/name`, `pull.number`, agent name, `findingRows` counted by severity via the new module-level `countBySeverity` helper) and hands it to `container.notifier()`. Wrapped in try/catch that logs into the Live Log — identical to how every other best-effort side-concern (callers digest, repo map, intent) behaves here. Only successful runs are announced; a failed/cancelled run produced no findings. |
| `server/.env.example` | modified | Documents `SLACK_WEBHOOK_URL` alongside the other secrets, stating that empty = feature off. |

**Deliberately not touched:** `server/src/vendor/shared/adapters.ts`. It is on the do-not-touch list and
is mirrored byte-for-byte into `client/src/vendor/shared/` — adding a server-only port there would force
a divergence in a file the client never reads. `SecretKey` is already `… | (string & {})`, so
`secrets.get('SLACK_WEBHOOK_URL')` typechecks with no change. And per the note at the top of
`platform/config.ts`, secrets deliberately do **not** live in `AppConfig` — the `SecretsProvider` is the
single read chokepoint — which is exactly what "from config like the other secrets do" means in this repo.

## How the pieces call each other at run time

`POST /pulls/:id/review` → `ReviewService.runReview` creates one `agent_runs` row per target agent and
fire-and-forgets `ReviewRunExecutor.executeRuns`, which loads the diff once and then calls `runOneAgent`
per agent. Inside `runOneAgent`, the review is produced by `reviewer-core`, the findings are persisted
(`insertReview` → `insertFindings`), the run row is closed (`completeAgentRun`) and the trace is saved
(`saveRunTrace`). Only then — the run is already durable and green — does `runOneAgent` await the new
`notifyRunFinished`, which asks the container for a `Notifier`. The container resolves
`SLACK_WEBHOOK_URL` through the `SecretsProvider` (stored `~/.devdigest/secrets.json` first, `process.env`
as fallback) and returns a cached `SlackWebhookNotifier` when a URL exists, or a `NoopNotifier` when it
does not; the executor cannot tell the difference. The Slack impl formats the domain payload into one
mrkdwn line and POSTs `{ text }` to the webhook with a 5s timeout and 2 retries on 429/5xx (`withTimeout`
+ `withRetry` from `platform/resilience.ts`, the same primitives the Octokit adapter uses). Success writes
one `slack: run summary posted…` line into the Live Log; a failure is swallowed and logged the same way,
so a Slack outage can never fail a review. Finally `runBus.complete(runId)` closes the SSE stream. Note
the notification is **per agent run**, so a review dispatched to three agents posts three messages — that
matches "when a review run finishes", and the agent name is in the message to disambiguate them.
