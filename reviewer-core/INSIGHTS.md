# Reviewer Core INSIGHTS

## What Works

- Pure module boundary (no I/O) makes unit testing trivial — just inject MockLLMProvider
- Grounding gate catches hallucinated citations before they reach the user
- To test prompt assembly (`generateIntent`, etc.), reuse `MockLLMProvider` from `../../server/src/adapters/mocks.js` and read its `.calls` to inspect the assembled `messages` — assert untrusted blocks like `<untrusted source="pr_body">` are present/absent per input, and that an author body containing `</untrusted>` is escaped to `<\/untrusted>` (proves `wrapUntrusted` runs and the injection breakout is neutralized)

## What Doesn't Work

<!-- Dead ends and anti-patterns — the most valuable section, don't skip -->

## Codebase Patterns

<!-- Conventions and architectural decisions -->

- No JS emitted — consumers import TypeScript source via tsconfig path alias
- All external deps injected via LLMProvider interface
- INJECTION_GUARD appended to every agent prompt automatically
- Adding a new untrusted prompt section (e.g. `intent`): add the optional string to BOTH `PromptParts` (`prompt.ts`) and `ReviewInput` (`review/run.ts`), thread it through `run.ts`'s `promptParts`, and render it in `assemblePrompt`'s `userSections` with `wrapUntrusted('<label>', …)` + a trim-empty guard (omit-when-blank = no behavior change). The engine stays pure — the caller composes the string (e.g. server reads cached `pr_intent`); reviewer-core just renders it. `INJECTION_GUARD` already names "derived intent/scope" as data, so no guard change is needed for an intent section.
- Section ORDER in the user message is the `userSections.push` order in `assemblePrompt`: task → PR description → PR intent → skills → memory → repo skeleton → project context → callers → diff. The diff is always last.

## Tool & Library Notes

<!-- Quirks and gotchas of dependencies -->

## Recurring Errors & Fixes

<!-- Recurring errors + fix -->

## Session Notes

<!-- Dated session summaries — add after each significant session -->

### 2026-06-28 — `intent` prompt section
- Added an optional `intent` untrusted section (`PromptParts` + `ReviewInput` + `assemblePrompt`), rendered after PR description, before the diff. Server passes a digest built from the cached `pr_intent` row (no model call). Covered by `test/prompt.test.ts` (render order + omit-when-blank).

## Open Questions

<!-- What remains unresolved -->
