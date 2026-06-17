# Reviewer Core INSIGHTS

## What Works

- Pure module boundary (no I/O) makes unit testing trivial — just inject MockLLMProvider
- Grounding gate catches hallucinated citations before they reach the user

## What Doesn't Work

<!-- Dead ends and anti-patterns — the most valuable section, don't skip -->

## Codebase Patterns

<!-- Conventions and architectural decisions -->

- No JS emitted — consumers import TypeScript source via tsconfig path alias
- All external deps injected via LLMProvider interface
- INJECTION_GUARD appended to every agent prompt automatically

## Tool & Library Notes

<!-- Quirks and gotchas of dependencies -->

## Recurring Errors & Fixes

<!-- Recurring errors + fix -->

## Session Notes

<!-- Dated session summaries — add after each significant session -->

## Open Questions

<!-- What remains unresolved -->
