# Client INSIGHTS

## What Works

- TanStack Query hooks wrapping apiFetch — clean separation of data fetching from UI
- Server Components by default, "use client" only when necessary

## What Doesn't Work

<!-- Dead ends and anti-patterns — the most valuable section, don't skip -->

## Codebase Patterns

<!-- Conventions and architectural decisions -->

- All data fetching via hooks in src/lib/hooks/ — never raw fetch() in components
- vendor/ui/ is read-only vendored design system
- vendor/shared/ must stay in sync with server/src/vendor/shared/

## Tool & Library Notes

<!-- Quirks and gotchas of dependencies -->

- next-intl is wired but not actively used in starter — messages/en.json is the source
- NEXT_PUBLIC_API_BASE controls API URL (default http://localhost:3001)

## Recurring Errors & Fixes

<!-- Recurring errors + fix -->

## Session Notes

<!-- Dated session summaries — add after each significant session -->

## Open Questions

<!-- What remains unresolved -->
