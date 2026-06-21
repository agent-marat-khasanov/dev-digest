# Structure & Co-location

The organizing principle of `client/` is **co-location**: files that change together live together. We organize by *feature/route*, not by file *type*.

## Why co-location (not global type folders)

Most React tutorials suggest global `services/`, `utils/`, `contexts/`, `constants/` folders. DevDigest deliberately does **not** use them, because:

- As an app grows, a single feature gets spread across many type-folders, so a change touches `components/X`, `utils/x`, `constants/x`, `hooks/x` — four distant edits for one logical change.
- Co-located code is easier to read, move, and delete as a unit. When a route dies, its whole folder dies with it — no orphaned helpers left in a global bucket.
- Next.js App Router makes this safe: nested folders define routes, and `_`-prefixed folders are **private** (non-routable), so feature code sits right inside the route without leaking into the URL.

Sources: [Next.js project-structure docs](https://nextjs.org/docs/app/getting-started/project-structure), [Robin Wieruch](https://www.robinwieruch.de/react-folder-structure/), [Max Rozen](https://maxrozen.com/guidelines-improve-react-app-folder-structure). See [references.md](references.md).

## The placement ladder

When you write a new file, place it at the **lowest** level that covers all its users:

1. **Inside one component file** — if only that component uses it and it's small.
2. **Beside the component** (`constants.ts` / `helpers.ts` / `styles.ts` in the same folder) — used by that component only.
3. **In the route folder** (`app/<route>/constants.ts`) — used by the page and its private components.
4. **In `src/components/`** — a component shared by 2+ routes.
5. **In `src/lib/`** — cross-cutting *infrastructure* only (see below).

Never place something higher than its actual usage. A page-specific helper does **not** go in `lib/`.

## Real examples (don't invent — these exist)

Page-scoped co-location — the PR list route:
```
app/repos/[repoId]/pulls/
  page.tsx
  constants.ts     # STATUS_META, SIZE_COLOR, GRID, SIZE_SMALL_MAX
  helpers.ts       # sizeOf(), relativeTime()
  styles.ts        # the `s` style-object
  _components/
    FilterBar/
    PRRow/
      PRRow.tsx
      FindingsPopover.tsx
      index.ts
```

Nested private sub-components (real, multi-level):
```
app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/...
app/agents/[id]/_components/AgentEditor/_components/...
```

## `lib/` is infrastructure only

`src/lib/` is **not** a `utils` dumping ground. It holds cross-cutting machinery used app-wide:

| File | Role |
|---|---|
| `api.ts` | `apiFetch<T>` + `ApiError` — the single network boundary |
| `hooks/` | TanStack Query hooks, split by domain |
| `providers.tsx` | QueryClient + Theme + Repo + Toast providers |
| `repo-context.tsx`, `theme.tsx`, `toast.tsx` | app-wide React contexts |
| `types.ts` | re-exports `@devdigest/shared` + a few view types |
| `format-cost.ts`, `github-urls.ts`, `model-label.ts` | genuinely app-wide pure helpers |

A helper qualifies for `lib/` only when it's used across **unrelated** features. If it serves one route, it stays in that route's `helpers.ts`.

## Nesting limit

Keep nesting shallow — aim for ≤3–4 levels of meaningful folders within a feature. Deep trees make imports unwieldy and moves painful. Co-location + private sub-folders, not deep type-hierarchies.

## Path aliases (from `client/tsconfig.json`)

```
@/*                  → ./src/*
@devdigest/ui        → ./src/vendor/ui/index.ts     (design system barrel)
@devdigest/ui/*      → ./src/vendor/ui/*
@devdigest/shared    → ./src/vendor/shared/index.ts (Zod contracts barrel)
@devdigest/shared/*  → ./src/vendor/shared/*
```

Use aliases for anything outside the current folder. Never write `../../../../lib/types` — write `@/lib/types`. Never reach past a vendor barrel into its internals unless an alias path exists for it.
