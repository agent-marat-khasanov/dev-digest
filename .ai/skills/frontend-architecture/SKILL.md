---
name: frontend-architecture
description: "DevDigest frontend architecture & code-placement expert (client/, Next.js 15 App Router + React 19). ALWAYS invoke this skill when creating, splitting, moving, or refactoring any file under client/, or deciding WHERE frontend code belongs — components, business-logic hooks, constants, helpers, types, the RSC (server/client) boundary, co-location, folder-per-component, lib/ infrastructure, path aliases. Do not place, split, or move frontend code directly — consult this skill first. Does NOT cover performance (memoization, bundling, caching) — use react-best-practices / next-best-practices for that."
---

# DevDigest Frontend Architecture

How code is **organized and placed** in `client/`. This skill answers *"where does X go and how is it split?"* — not how to make it fast.

**Scope:** structure, placement, splitting, naming, RSC boundary as a *placement* decision, human-friendly organization.
**Out of scope:** performance (memo, `useMemo`/`useCallback`, bundling, re-renders, caching) → use `react-best-practices` / `next-best-practices`. Testing → `react-testing-library`.

## Prime directive: co-location is the canon

Code lives **next to where it is used**, not in global type-buckets. DevDigest has **no global `utils/`, `services/`, `contexts/`, or `constants/` folders** — and we don't create them. Promote to a shared location *only* when something is genuinely used by 2+ unrelated places. "Twice — tolerate; thrice — extract."

## Decision rules — "where does X go?"

| You are adding… | Put it… |
|---|---|
| Component used by **one** page/route | `app/<route>/_components/<Name>/` (private folder) |
| Component used by **2+** routes | `src/components/<name>/` |
| Sub-component used by one component | nested `_components/` inside that component's folder |
| Data fetching / mutation (TanStack Query) | `src/lib/hooks/<domain>.ts` |
| Constants for a page/component | `constants.ts` **next to it** |
| Pure helper for a page/component | `helpers.ts` **next to it** |
| Style objects for a page/component | `styles.ts` **next to it** |
| Cross-cutting infrastructure (api client, providers, theme, toast, context) | `src/lib/*.ts(x)` |
| Domain type | re-export from `@devdigest/shared` via `src/lib/types.ts`; view-only types co-located |
| UI primitive / design-system piece | **don't** — import from `@devdigest/ui` (do not edit `vendor/`) |

## Canonical tree (`client/src/`)

```
app/                      # App Router — routes only
  <route>/
    page.tsx              # Server Component by default
    layout.tsx
    constants.ts          # ← co-located, page-scoped
    helpers.ts            # ← co-located, page-scoped
    styles.ts             # ← co-located, page-scoped
    _components/          # ← page-private components (underscore = not routable)
      <Name>/
        <Name>.tsx
        index.ts          # barrel: export { <Name> } from "./<Name>"
        _components/      # ← deeper-nested private sub-components (real pattern here)
components/               # shared chrome used across routes (app-shell, page-shell, diff-viewer…)
lib/                      # infrastructure ONLY
  api.ts                  # apiFetch<T> + ApiError — the only place fetch() lives
  hooks/                  # TanStack Query hooks, split by domain (reviews, agents, core…)
  providers.tsx  theme.tsx  toast.tsx  repo-context.tsx
  types.ts                # re-exports @devdigest/shared + view types
vendor/ui/                # design system  → @devdigest/ui   (DO NOT EDIT)
vendor/shared/            # Zod contracts  → @devdigest/shared (DO NOT EDIT)
```

## Hard rules

1. **Co-locate.** Page/component-scoped `constants.ts` / `helpers.ts` / `styles.ts` live beside the code. No global buckets. → [structure.md](structure.md)
2. **Folder-per-component + barrel.** Each component is a folder with `<Name>.tsx` + `index.ts`. Consumers import the barrel, never deep paths. PascalCase files, camelCase functions. → [components.md](components.md)
3. **All network access goes through `lib/api.ts`.** No raw `fetch()` in components. Data flows through TanStack Query hooks in `lib/hooks/<domain>.ts`. Query keys are flat tuples: `["reviews", prId]`. → [business-logic.md](business-logic.md)
4. **Logic out of JSX.** Stateful/business logic lives in custom hooks; components stay presentational. → [business-logic.md](business-logic.md)
5. **Server by default; `"use client"` at the leaves.** The directive is a placement decision — push it down to the smallest interactive node. → [rsc-boundaries.md](rsc-boundaries.md)
6. **Use path aliases.** `@/*`, `@devdigest/ui`, `@devdigest/shared`. Never reach into `vendor/` internals or write `../../../../`.
7. **Write for two readers — human and agent.** Explicit names, intent over cleverness, high semantic density. → [human-friendly.md](human-friendly.md)

## Reference files

- [structure.md](structure.md) — directory map & co-location, in depth
- [components.md](components.md) — folder-per-component, barrels, shared vs private, naming
- [business-logic.md](business-logic.md) — hooks, api client, query keys, logic/UI split
- [rsc-boundaries.md](rsc-boundaries.md) — `"use client"` placement, children-pattern
- [human-friendly.md](human-friendly.md) — readable code for humans + agents
- [references.md](references.md) — external sources & rationale

## Do-not-touch (from CLAUDE.md)

`vendor/ui/` and `vendor/shared/` are vendored — import via aliases, never edit.
