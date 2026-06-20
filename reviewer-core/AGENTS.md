# @devdigest/reviewer-core — Review Engine

Pure TypeScript review engine. No I/O except LLM calls via injected `LLMProvider`. No database, no filesystem, no GitHub API.

## Commands

```sh
pnpm typecheck               # tsc --noEmit (this IS the build — no JS emitted)
pnpm test                    # vitest (unit only, mocked LLM)
```

## Architecture

- **Entry:** `src/index.ts` — public API barrel export
- **Prompt:** `src/prompt.ts` — `assemblePrompt()` + `wrapUntrusted()` + `INJECTION_GUARD`
- **Engine:** `src/review/run.ts` — `reviewPullRequest()` orchestrates the full review
- **Grounding:** `src/grounding.ts` — `groundFindings()` validates citations against diff
- **Reduce:** `src/review/reduce.ts` — map-reduce for large diffs (parallel LLM calls per file)
- **LLM:** `src/llm/` — OpenRouter provider + structured output helpers

## Conventions

- **Pure module** — NEVER add I/O (fs, network, DB). All deps injected via `LLMProvider` interface
- **No JS output** — consumers import TypeScript source directly via tsconfig path alias
- Grounding gate is mandatory: findings citing non-existent diff lines are dropped, score recalculated
- Prompt injection hardening: untrusted content wrapped with `wrapUntrusted()`, `INJECTION_GUARD` appended to every agent prompt
- Large diffs -> automatic map-reduce (chunk by file, parallel LLM, merge + re-ground)

## Read When

- `README.md` — review pipeline, public API, testing approach
- `INSIGHTS.md` — module-specific gotchas and non-obvious behavior
- `docs/` — engine-specific documentation
