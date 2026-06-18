# @devdigest/web — Client Module

Next.js 15 App Router with React 19, TanStack Query v5, Tailwind CSS 4.

## Commands

```sh
pnpm dev                     # next dev -p 3000
pnpm test                    # vitest (jsdom, component tests)
pnpm typecheck               # tsc --noEmit
pnpm build                   # next build (production)
```

## Architecture

- **Pages:** `src/app/` — App Router (onboarding, repos/[repoId]/pulls, agents, settings)
- **Hooks:** `src/lib/hooks/` — TanStack Query wrappers (useRepos, useRunEvents, useAgents)
- **API client:** `src/lib/api.ts` — `apiFetch()` with error normalization to `ApiError`
- **Providers:** `src/lib/providers.tsx` — QueryClient, Theme, Repo context, Toast stack
- **Vendored UI:** `src/vendor/ui/` — design system components (DO NOT refactor)
- **Shared contracts:** `src/vendor/shared/` — Zod schemas (synced from server)

## Conventions

- Server Components by default; `"use client"` only when needed (hooks, interactivity)
- All data fetching through TanStack Query hooks — no raw `fetch()` in components
- Review runs stream via SSE (`useRunEvents` hook)
- i18n wired via `next-intl` (`messages/en.json`) — not actively used in starter
- Tests use `@testing-library/react` — test behavior, not implementation

## Gotchas

- `vendor/ui/` is vendored — treat as read-only dependency
- `vendor/shared/` must stay in sync with `server/src/vendor/shared/`
- API base URL: `NEXT_PUBLIC_API_BASE` env var (default `http://localhost:3001`)

## Read When

- `README.md` — UI route map, stack, testing notes
- `src/vendor/ui/README.md` — design system component catalog
- `INSIGHTS.md` — module-specific gotchas and non-obvious behavior
- `docs/` — client-specific documentation
