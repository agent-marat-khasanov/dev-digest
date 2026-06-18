# E2E INSIGHTS

## What Works

- Deterministic JSON flow specs — reliable CI, no flakiness from AI actions
- Hermetic mode (isolated Postgres) — specs never pollute dev DB

## What Doesn't Work

<!-- Dead ends and anti-patterns — the most valuable section, don't skip -->

## Codebase Patterns

<!-- Conventions and architectural decisions -->

- Never use agent-browser "chat" command — always use --url, --text, --selector
- Specs are numbered for consistent execution order

## Tool & Library Notes

<!-- Quirks and gotchas of dependencies -->

- agent-browser is a Rust CLI binary — first run downloads Chrome for Testing (slow)

## Recurring Errors & Fixes

<!-- Recurring errors + fix -->

## Session Notes

<!-- Dated session summaries — add after each significant session -->

## Open Questions

<!-- What remains unresolved -->
