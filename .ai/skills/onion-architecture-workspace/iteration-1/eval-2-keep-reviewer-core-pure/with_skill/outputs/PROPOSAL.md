# Cross-PR conflict notes on findings — proposal

**Goal.** A finding should say, in its own text, whether the file it points at is already being
changed by another open PR. The list of open PRs and the files they change comes from GitHub and is
used when the findings are built.

**Layering decision (onion).** `reviewer-core` is the pure core: it may not talk to GitHub, so the
*decision* ("does another open PR touch this file?") is pure set logic that lives in the core, while
the *fetching* is I/O and lives in the server's application layer, reached through the existing
`GitHubClient` **port** resolved from the `Container`. The core receives plain data
(`OpenPrChanges[]`) exactly the way it already receives skill bodies, spec chunks and the intent
digest — never an Octokit client, never a repo id to go look things up with.

**Why no new port method.** `GitHubClient` already exposes `listPullRequests(repo)` (which carries
`status`, so open PRs can be filtered) and `getPullRequest(repo, n)` (whose `PrDetail.files[].path`
is the changed-file list). Composing those two is ordinary application-layer orchestration, so
`server/src/vendor/shared/adapters.ts` (a synced, do-not-touch contract file, mirrored into
`client/`), `adapters/github/octokit.ts` and `adapters/mocks.ts` all stay untouched. Adding a
convenience port method that is just a composition of two existing ones would be the premature
abstraction the skill's rule 7 warns against ("twice, tolerate; thrice, extract"). Tests already get
this for free: `MockGitHubClient` implements both methods.

**Why no contract/DB change.** The task asks for the *finding text* to mention the conflict, so the
note is appended to `Finding.rationale` (markdown, already persisted by
`ReviewRepository.insertFindings` and already rendered in the UI). No change to the `Finding` Zod
contract, no migration, no client work.

## Files

| repo-relative path | new / modified | what goes in it and why it belongs there |
|---|---|---|
| `reviewer-core/src/conflicts.ts` | **new** | The pure conflict logic, sibling of `grounding.ts`: `OpenPrChanges` (the input shape: PR number/title/author + changed paths), `buildConflictIndex()` (invert PR→files into file→PRs), `conflictNote()` (the markdown sentence), `annotateConflicts()` (append the note to the rationale of every finding whose file is in the index, returning new objects). Domain/core layer — no I/O, no GitHub, no Octokit, no DB; it imports only the `Finding` contract. Rule 2 ("keep the core pure") and the decision table's "pure review logic → `reviewer-core`". |
| `reviewer-core/src/review/run.ts` | modified | `ReviewInput` gains one optional field `otherOpenPrs?: OpenPrChanges[]` (resolved by the caller; PR under review already excluded). After the grounding gate, `reviewPullRequest` builds the index and annotates the kept findings, emits a `result` event, and returns `conflicts: number` on `ReviewOutcome`. This is where findings are built, so this is where the conflict is stamped onto them. Absent input → identical output to today (empty index ⇒ `annotateConflicts` returns the same array), which keeps the other two callers (`review-working`, `evals`) working unchanged. |
| `reviewer-core/src/index.ts` | modified | Public API barrel: export `buildConflictIndex`, `annotateConflicts`, `conflictNote` and the `OpenPrChanges` / `ConflictIndex` / `AnnotatedFindings` types, so the server can type the value it constructs. The barrel is the core's published surface; the server imports the *type* from the core, not the other way round (dependency points inward). |
| `server/src/modules/reviews/run-executor.ts` | modified | The I/O half. New private `buildOpenPrChanges(repo, pull, runLog)`: resolves the `GitHubClient` **through the container** (`await this.container.github()` — never `new Octokit()`), lists PRs, keeps `status === 'open'` minus the PR under review, caps at `MAX_CONFLICT_PRS`, calls `getPullRequest` per PR for its `files[].path`, and maps to `OpenPrChanges[]`. Called once in `executeRuns` (shared pre-work for all queued agents, like the diff), passed into `reviewPullRequest` as `otherOpenPrs`. Best-effort like the other enrichments: no PAT / rate limit / any GitHub error → a Live Log line and `undefined`, never a failed run. Application layer orchestrating a port + infrastructure — exactly rule 3 and rule 6. |
| `server/src/modules/reviews/constants.ts` | modified | Adds `MAX_CONFLICT_PRS = 10` — the cap on how many other open PRs are scanned (each costs one `getPullRequest` call). A module tunable, next to `REVIEW_STRATEGY`. |

## How the pieces call each other at run time

A review is triggered → `ReviewRunExecutor.executeRuns` does the shared pre-work: it loads the diff,
then calls `buildOpenPrChanges`, which resolves the `GitHubClient` port from the composition root
(`container.github()` builds `OctokitGitHubClient` from the stored `GITHUB_TOKEN`), calls
`listPullRequests` once, filters to the other open PRs, and calls `getPullRequest` for each to read
its changed file paths — producing a plain `OpenPrChanges[]` (one GitHub lookup for all queued
agents). That array is handed to `reviewPullRequest` per agent, alongside the diff and the injected
`LLMProvider`. Inside the pure core the flow is unchanged — assemble prompt → LLM →
`reduceReviews` → `groundFindings` — and then, on the findings that survived grounding,
`buildConflictIndex` inverts the array into `file → PRs` and `annotateConflicts` appends
``**Conflict:** `src/config.ts` is also changed by 2 other open PR(s): #482 "…" (@marisa.koch), …``
to the `rationale` of every finding whose file is in that index. Only the rationale changes, so
`scoreFromFindings` and `countBlockers` behave exactly as before. The annotated findings flow back
out in `ReviewOutcome.review.findings`, and the executor persists them with `insertFindings` — so
the conflict shows up in the stored finding, the SSE Live Log (`Cross-PR conflicts: N/M finding(s)…`),
and any GitHub review comment built from the same findings. The dependency direction stays inward
throughout: the server knows about `reviewer-core` and `GitHubClient`; `reviewer-core` knows about
neither the server nor GitHub.
