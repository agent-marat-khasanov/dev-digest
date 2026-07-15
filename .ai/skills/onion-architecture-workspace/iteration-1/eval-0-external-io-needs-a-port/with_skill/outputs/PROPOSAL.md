# Proposal — Slack summary when a review run finishes

Posting to Slack is **cross-process external I/O**, so it goes through a **port** (`Notifier`, in the
domain) implemented by an **adapter** (`SlackNotifier`, infrastructure) and wired in the **composition
root** (`Container`). The webhook URL is a secret, resolved through `SecretsProvider` exactly like
`GITHUB_TOKEN` / the API keys — feature code never reads `process.env`, and never learns the URL.

## Files

| Repo-relative path | New / modified | What goes in it, and why it belongs there |
|---|---|---|
| `server/src/vendor/shared/adapters.ts` | modified | **Domain (ports).** Adds `SeverityCounts`, `ReviewRunSummary` (repo ref + PR number + per-severity tally) and the `Notifier` port: `reviewRunFinished(summary)`. Vendor-free by construction — it says *what happened*, never "Slack", never a webhook URL. Also adds `SLACK_WEBHOOK_URL` to the `SecretKey` union so the key is documented alongside the other secrets. This is step 1 of the ports-and-adapters recipe; the port must live inward so both the service and the adapter depend on it and not on each other. |
| `server/src/adapters/notifier/slack.ts` | **new** | **Infrastructure (adapter).** `SlackNotifier implements Notifier` — the only file that knows Slack exists: the webhook URL, the `POST { text }` shape, Slack's `&`/`<`/`>` escaping, the wording of the message, the 5 s timeout and retry-on-429/5xx (reusing `platform/resilience`). Swapping Slack for Teams later touches this file only. |
| `server/src/adapters/notifier/noop.ts` | **new** | **Infrastructure (adapter).** `NoopNotifier implements Notifier` — the null object wired when no webhook is configured. Keeps "is notification switched on?" a *composition-root* decision, so no service branches on configuration. |
| `server/src/adapters/mocks.ts` | modified | **Infrastructure (test doubles).** Adds `MockNotifier implements Notifier`, recording the summaries a run would have sent. Step 3 of the recipe — every port gets a mock so `ContainerOverrides` can swap it with zero network. |
| `server/src/adapters/index.ts` | modified | Adapter barrel — exports `SlackNotifier` + `NoopNotifier` next to the other concretes. |
| `server/src/platform/container.ts` | modified | **Composition root.** Adds `notifier?: Notifier` to `ContainerOverrides`, and `async notifier(): Promise<Notifier>` — the async-because-it-needs-a-secret shape already used by `github()` / `llm(id)`: read `SLACK_WEBHOOK_URL` from `SecretsProvider`, build `SlackNotifier(url)` when present, else `NoopNotifier`; memoized, and cleared in `invalidateSecretCaches()` so a webhook saved at runtime is picked up. The only file that names a concrete notifier class. |
| `server/src/modules/reviews/helpers.ts` | modified | **Boundary mapping.** Adds the pure `countBySeverity(findings: FindingRow[]): SeverityCounts` — turns persisted Drizzle rows into the domain tally the port takes, so no DB row ever crosses into the port (rule 5). Pure, `this`-free, in the file that already owns row→DTO mapping. |
| `server/src/modules/reviews/run-executor.ts` | modified | **Application (orchestration).** After the run is persisted (`insertReview` → `insertFindings` → `completeAgentRun`), calls the new private `notifyRunFinished(...)`: resolve `container.notifier()`, build `{ repo: {owner,name}, prNumber, bySeverity }`, `await notifier.reviewRunFinished(...)`. Best-effort — a webhook failure is written to the Live Log, never fails a run whose review is already saved. No `fetch`, no URL, no Slack import here. |
| `server/.env.example` | modified | Documents `SLACK_WEBHOOK_URL` (empty ⇒ notifications off) beside the other secrets. |

Not touched, deliberately: `routes.ts` (nothing new is exposed over HTTP), `platform/config.ts` (the
webhook is a *secret*, and `AppConfig` deliberately holds no secrets — see its header comment), and
`client/src/vendor/shared/` (already divergent from the server copy; the `Notifier` port is a
server-side capability the UI has no use for).

## How the pieces call each other at run time

A review run reaches its end inside `ReviewRunExecutor.runOneAgent` (application ring): the engine's
findings are persisted and the `agent_runs` row is marked `done`. It then calls its own
`notifyRunFinished`, which asks the composition root for the port — `await this.container.notifier()`.
The `Container` reads `SLACK_WEBHOOK_URL` through `SecretsProvider` (file-backed, env fallback) and
hands back either a `SlackNotifier` holding that URL or a `NoopNotifier`; the executor cannot tell
which, and does not care. It maps the persisted `FindingRow[]` through the pure `countBySeverity`
helper into a `ReviewRunSummary` — `{ repo: { owner, name }, prNumber, bySeverity }` — and awaits
`notifier.reviewRunFinished(summary)`. Only inside `SlackNotifier` does that summary become a Slack
sentence ("Review finished — *owner/repo* PR #482: 4 findings (2 critical, 1 warning, 1 suggestion)")
and a `POST` to the webhook, guarded by a 5 s timeout with retry on 429/5xx. The call is awaited but
wrapped in try/catch: a Slack outage produces one `notify: failed…` line in the Live Log and the run
still completes and persists its trace. Dependencies all point inward — the executor depends on the
`Notifier` interface in `vendor/shared`, the adapter depends on the same interface, and only
`container.ts` knows both.
