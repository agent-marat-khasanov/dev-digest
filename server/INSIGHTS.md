# Server INSIGHTS

## What Works

- Route -> Service -> Repository plugin structure per module
- Zod schemas on both sides (validate request + serialize response via fastify-type-provider-zod)
- All queries scoped by workspace_id
- Nullable Drizzle columns (`doublePrecision('cost_usd')` without `.notNull()`) for backward-compatible schema evolution — existing rows get `null`, no default needed, tests pass with `cost_usd: null` in mocks

## What Doesn't Work

<!-- Dead ends and anti-patterns — the most valuable section, don't skip -->

- Adding a `.notNull()` column WITHOUT a DB-level default to an existing table breaks `pnpm typecheck`
  for EVERY pre-existing Drizzle `insert()` of that table — including dead/unused code — because the
  insert object no longer satisfies the row type. Hit this on `pr_intent.head_sha` (NOT NULL, no
  default): the soon-to-be-deleted `upsertIntent` insert stopped compiling. If the schema-add wave
  runs before the dead-code-removal wave, either add a placeholder value to the stale insert or give
  the column a default. The `risks` jsonb column did NOT break anything because it has
  `.default(sql\`'[]'::jsonb\`)`. Prefer a DB default when the column allows one.

## Codebase Patterns

<!-- Conventions and architectural decisions -->

- Every Fastify module is a plugin registered in src/modules/index.ts (no autoload)
- DI container in platform/container.ts is the single composition root
- Secrets never in DB — always in ~/.devdigest/secrets.json (mode 0600)
- Any query that aggregates findings through `findings JOIN reviews` MUST filter `reviews.kind = 'review'` — the `reviews` table also holds `kind='summary'` rows (and may gain more kinds). Omitting the filter silently inflates counts. Both `pulls/routes.ts` (PR list) and `run.repo.ts` (timeline) enforce this
- To run a review for a **skill alone** (no agent → no provider/model/system-prompt), use the seed defaults: `container.llm('openrouter')` + model `'deepseek/deepseek-v4-flash'` + `GENERAL_REVIEWER_PROMPT` (from `db/seed-prompts.ts`), and inject the skill body via `reviewPullRequest({ skills: [skill.body], ... })`. This is what `modules/evals/service.ts` does
- `parseUnifiedDiff` (`adapters/git/diff-parser.ts`) is pure (no I/O) so a service may import it directly without violating the dependency rule. A raw unified-diff string (e.g. `eval_cases.input_diff`) becomes a `UnifiedDiff` via this one call — same parser the live review path uses
- Several future-lesson features are PRE-SCAFFOLDED across the codebase before the lesson is built: e.g. the `conventions` lesson already had a `conventions` table (`db/schema/knowledge.ts`), a `ConventionCandidate` contract, a registered `'conventions'` feature-model (`vendor/shared/contracts/platform.ts` `FEATURE_MODELS`, default `openai/gpt-5.4`), partial i18n (`client/messages/en/conventions.json`), and a nav active-key. Grep the schema + contracts + feature-models + messages BEFORE creating anything — extend the stubs, don't duplicate. The pre-scaffolded table was minimal (`accepted` boolean, no status/category/line); altering it (empty table) is safe
- System LLM features resolve their provider+model via `resolveFeatureModel(container, workspaceId, '<featureId>')` (`modules/settings/feature-models.ts`) — workspace Settings override, else the `FEATURE_MODELS` registry default. Use this instead of hardcoding a model for any feature listed in `FEATURE_MODELS` (onboarding, review_intent, risk_brief, conformance, conventions)

## Tool & Library Notes

<!-- Quirks and gotchas of dependencies -->

- fastify-type-provider-zod: response schema mismatch throws 500 (not 422) — always validate both sides
- drizzle-kit generate: must run before db:migrate, otherwise migration is empty
- testcontainers: slow on first run (pulls Docker image); fast on subsequent runs
- Drizzle `doublePrecision` maps to PostgreSQL `double precision` — use it for fractional values like USD costs (not `integer`). Cost computation happens in `run-executor.ts` using OpenRouter's `usage.cost` when available, falling back to `estimateCost(model, tokensIn, tokensOut)`
- `parseUnifiedDiff`'s `hunk.newLineNumbers` includes EVERY new-side line in the hunk (context lines too, not just `+` additions). So the grounding gate accepts a finding citing a context line inside a changed hunk. When authoring eval fixtures, expected line spans only need to land anywhere inside the hunk's new range, not exactly on the `+` line
- Verifying DB rows via `docker exec <pg> psql ...` does NOT surface stdout reliably through the agent harness (output came back empty). Verify Postgres data instead with a throwaway `tsx` script using `createDb(process.env.DATABASE_URL)` from `db/client.js` — its stdout is captured normally (must wrap in an async `main()`, top-level await fails under the cjs transform). `createDb` returns a `{ db, sql, close }` handle — destructure `db`, don't call methods on the handle. Put the script INSIDE `server/` (not `/tmp`) so `dotenv` + path aliases resolve
- `drizzle-kit generate` is INTERACTIVE whenever a table gains AND drops columns in the same change — it prompts "Is X created or renamed from another column?" per new column. Piping `yes ""` or a burst of `\r` FAILS (the hanji TUI discards input buffered between renders, so it stalls). Drive it with a python `pty.fork()` script that watches stdout and writes ONE `\r` each time a new "created or renamed" prompt appears — `\r` selects the highlighted default (first option = "create column"), which is what you want for an empty future-lesson table (drops the old cols, adds the new). Then review the generated SQL before `db:migrate`
- `LLMProvider.completeStructured({ schema })` forces tool-use, and tool inputs MUST be objects — a bare `z.array(...)` schema will not work. Wrap list output as `z.object({ items: z.array(...) })` (we used `ConventionExtraction = z.object({ conventions: [...] })`). It also auto-retries on schema-validation failure and throws `ExternalServiceError` after `maxRetries`, so callers get a clean 5xx without hand-parsing JSON

## Recurring Errors & Fixes

- "relation does not exist" -> migrations not applied: cd server && pnpm db:migrate
- Port 5432 in use -> another Postgres running; change host port in docker-compose.yml
- pgvector errors -> migrations ran against wrong DB (not Docker one)
- Reset all -> docker compose down -v && ./scripts/dev.sh

## Session Notes

### 2026-06-18 — Run Cost Badge
- Added `cost_usd` column to `agent_runs` table (nullable `doublePrecision`)
- Cost flows through shared Zod contracts: `RunStats`, `RunSummary`, `PrMeta`
- `PrMeta.cost_usd` is aggregated sum over a PR's done agent_runs (computed in SQL/pulls route)
- Shared contracts live in BOTH `server/src/vendor/shared/` and `client/src/vendor/shared/` — both must be updated in sync
- Test contract fixture in `server/test/contracts.test.ts` must include `cost_usd` to pass Zod validation

### 2026-06-18 — Findings Severity Badges
- Per-severity findings counts (CRITICAL/WARNING/SUGGESTION) added to both `PrMeta` (as nested `findings_by_severity` object) and `RunSummary` (as flat `sev_critical`/`sev_warning`/`sev_suggestion` — matching the existing flat scalar pattern on RunSummary)
- No DB schema changes needed: severity breakdown is computed at query time via `findings JOIN reviews GROUP BY severity` — the `findings` table already stores severity per row
- Pattern for cross-table aggregation on the PR list: the pulls route stacks multiple IN-queries (score, cost, findings) gated by `if (prIds.length > 0)`, each building a `Map<prId, value>` consumed in the final `.map()` return. New aggregations follow this same pattern
- `run.repo.ts` `listRunsForPull()` now includes a secondary query for per-run severity breakdown via `reviews.run_id` join — the function is no longer a single-query mapper

### 2026-06-22 — Skill Evals tab (real LLM runner)
- New `modules/evals/` module (routes + service + repository + pure `score.ts`) on the pre-existing `eval_cases`/`eval_runs` scaffolding tables — NO migration needed (they were already in `db/schema/eval.ts`)
- Routes are skill-scoped but live in their own module: `GET/POST /skills/:id/evals*`, `DELETE /skills/:id/evals/:caseId`. Path prefix doesn't dictate module ownership (same as agent↔skill links living in the agents module)
- `scoreEval(expected, actual, changedLines)` matches by file + category + overlapping line span (greedy 1:1). `pass` = all expected matched (clean case ⇒ actual empty); extra findings lower `precision` but don't fail a fully-recalled case
- Seeded 5 eval cases for the `pr-quality-rubric` skill (idempotent by workspace+owner+name); runs are NOT seeded (cases start "never run", populate on real LLM run)
- Run is real: executes the skill via `reviewPullRequest` and persists an `eval_runs` row; needs `OPENROUTER_API_KEY` in secrets

### 2026-06-22 — Conventions Extractor module + API Contract Reviewer seed
- New `modules/conventions/` (routes + service + repository + pure `helpers.ts` + `prompt.ts`), registered in `modules/index.ts`. Extended the pre-scaffolded `conventions` table (added category, evidence_line, evidence_code, status enum pending/accepted/rejected, timestamps; dropped accepted/evidence_snippet) → migration `0012_watery_dark_phoenix.sql`
- extract pipeline: read config files + `repoIntel.getConventionSamples(repoId, 12)` from the clone (`readFile(join(clonePath, rel))` with a path-traversal guard) → number the sample lines so the model cites accurate `line` → `completeStructured` with the `conventions` feature-model → code-based `evidenceMatches()` validation (exact line, else whole-file fallback) → `replaceForRepo` (delete+insert in a txn, re-scan is authoritative)
- `createSkillFromConventions` reuses `new SkillsService(container).create(...)` rather than touching `skills` tables directly — service-to-service call keeps versioning/snapshot logic in one place. Skill `type:'convention'`, `source:'extracted'`, evidence_files = cited paths
- Seeded the "API Contract Reviewer" agent (+ `API_CONTRACT_REVIEWER_PROMPT` in `seed-prompts.ts`) and 4 contract skills (breaking-change/response-schema/semver-discipline/deprecation-policy), all linked via `agent_skills`. Seed is idempotent (fetch-by-name, insert-if-missing); ran clean and verified via tsx script

## Open Questions

<!-- What remains unresolved -->
