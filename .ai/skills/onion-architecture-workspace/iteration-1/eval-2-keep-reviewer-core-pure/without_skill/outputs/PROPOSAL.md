# Open-PR file conflicts in findings

Goal: a finding should say when the file it points at is **also being changed by another open PR**.
The open-PR list + their changed files come from GitHub; the note is attached where the final
findings are built, inside `reviewer-core`.

Key constraint honoured: **`reviewer-core` performs no I/O.** Its only side effect stays the
injected `LLMProvider` (`reviewer-core/README.md`, `reviewer-core/src/index.ts` header). So GitHub
is called by the *caller* (the server, behind the existing `GitHubClient` port) and the open PRs are
handed to the engine as plain data — exactly how `diff`, `skills`, `specs`, `intent` and `repoMap`
already arrive.

## Files

| repo-relative path | new or modified | what goes in it and why it belongs there |
|---|---|---|
| `reviewer-core/src/review/overlap.ts` | **new** | Pure overlap logic: `buildTouchedFileIndex()` (file path → open PRs touching it) and `annotateOpenPrOverlaps(findings, openPrs)`, which appends an **"Open-PR conflict"** paragraph to the `rationale` of every finding whose file is contended. Deterministic, no model call, no I/O — it sits next to the other pure post-steps of the engine (`grounding.ts`, `review/reduce.ts`). Untouched findings are returned as the same object, so an empty list is a strict no-op. |
| `reviewer-core/src/review/run.ts` | modified | New optional engine input `openPrs?: OpenPrFiles[]` on `ReviewInput` (same "omit-when-empty" contract as `callers` / `repoMap` / `intent`). After the citation-grounding gate, the surviving findings go through `annotateOpenPrOverlaps` before the score is recomputed, and a `ReviewEvent` reports how many findings picked up a conflict note. Grounding stays first — we never annotate a finding that is about to be dropped. |
| `reviewer-core/src/index.ts` | modified | Public API barrel: exports `annotateOpenPrOverlaps` / `buildTouchedFileIndex` alongside the other engine helpers (the CI runner in L06 reuses the same function). |
| `server/src/vendor/shared/adapters.ts` | modified | The port. Adds the `OpenPrFiles` DTO (`number`, `title`, `author`, `files: string[]`) and one method on the existing `GitHubClient` interface: `listOpenPullRequestFiles(repo)`. Ports/adapter interfaces already live in this file (`GitHubClient`, `LLMProvider`, …), and `reviewer-core` already imports its types from `@devdigest/shared`, so both sides can name the same shape without the engine learning anything about GitHub. |
| `server/src/adapters/github/octokit.ts` | modified | Infrastructure implementation: `pulls.list({ state: 'open' })` (20 most-recently-updated, capped) + one `pulls.listFiles` per PR, mapped to `OpenPrFiles`, wrapped in the file's existing `withRetry`/`withTimeout` (with a longer timeout for the fan-out). This is the only place that knows the GitHub REST shape. |
| `server/src/adapters/mocks.ts` | modified | `MockGitHubClient` must satisfy the widened `GitHubClient` interface: returns `opts.openPrFiles ?? []`, so existing tests/dev keep working and new tests can drive the conflict path with no network. |
| `server/src/modules/reviews/run-executor.ts` | modified | Application layer / composition of the run. New `loadOpenPrFiles()` calls `container.github().listOpenPullRequestFiles()`, drops the PR under review and PRs with no files, and logs one Live-Log line. It is called **once per PR** in `executeRuns` (agent-independent, like the diff) and passed into `runOneAgent`, which forwards it to `reviewPullRequest({ openPrs })`. Best-effort like every other enrichment: a missing `GITHUB_TOKEN` or a failed call is an info line, never a failed run — it degrades to `[]` and the findings read exactly as before. |

## Run-time flow

`ReviewService` queues the runs and `ReviewRunExecutor.executeRuns` loads the diff, then calls
`loadOpenPrFiles(repo, pull)`: that resolves the `GitHubClient` from the container
(`OctokitGitHubClient` in prod, `MockGitHubClient` in tests) and calls the new
`listOpenPullRequestFiles(repo)`, which lists the repo's open PRs and their changed files and hands
back plain `OpenPrFiles[]`; the PR under review is filtered out, and any GitHub failure collapses to
an empty list. That array is fetched once and reused by every queued agent: `runOneAgent` passes it
to `reviewPullRequest({ …, openPrs })`. Inside the engine nothing changes until the LLM has answered
and the reduced findings have passed the citation-grounding gate; then `annotateOpenPrOverlaps`
builds a `file → open PRs` index and appends, to each surviving finding whose `file` appears in it, a
line such as ``**Open-PR conflict:** `src/config.ts` is also changed by another open PR — #482 "Add
rate limiting" (@marisa.koch). Coordinate before merging…`` The score is then recomputed from those
findings (severities are untouched, so the number is unchanged), the executor persists the findings
with `insertFindings`, and because the note lives in the finding's own `rationale` markdown, the
studio UI and the GitHub review payload (`toReviewPayload`) surface it with no further changes.

Deliberately **not** done: the open-PR list is not injected into the prompt. Making the note a
deterministic post-step (like grounding, like the recomputed score) means it is always factual and
costs zero extra tokens, instead of hoping the model repeats the fact for the right file.
