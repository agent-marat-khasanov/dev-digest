# Business Logic & Data

The rule: **logic lives in hooks, the network lives in `api.ts`, JSX stays presentational.**

## One network boundary: `lib/api.ts`

All HTTP goes through `apiFetch<T>` / the `api.*` helpers. Errors are normalized to `ApiError` (with `status`, `code`, `details`) so the error-UX taxonomy (toast / inline / full-screen) can branch on them.

```ts
// lib/api.ts
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";
export class ApiError extends Error { status; code?; details?; /* … */ }
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> { /* … */ }
```

- ❌ **Never** call `fetch()` directly inside a component or page.
- ❌ Never read `API_BASE` or build URLs ad-hoc in components.
- ✅ Components consume data only through hooks that wrap `api.*`.

## Data hooks live in `lib/hooks/<domain>.ts`

TanStack Query hooks are split by **domain**, not by page:

```
lib/hooks/
  core.ts        # settings, secrets, repos, pulls, context
  reviews.ts     # PR reviews, runs, findings, comments, live SSE
  agents.ts      # agent CRUD + list
  trace.ts       # single run trace
  repo-intel.ts  # repository indexing state
  index.ts       # barrel: export * from each domain
```

Every hook file starts with `"use client"` (hooks run on the client). Import either from the barrel or the domain file — both resolve:
```ts
import { usePrRuns } from "@/lib/hooks";          // via barrel
import { usePrRuns } from "@/lib/hooks/reviews";   // direct — both fine
```

### Query-key convention: flat tuples

Keys are simple arrays, **stable across the codebase**, scoped by id:
```ts
useQuery({ queryKey: ["reviews", prId], queryFn: () => api.get(`/pulls/${prId}/reviews`) });
useQuery({ queryKey: ["pr-active-runs", prId], /* … */ });
```
- ✅ `["reviews", prId]`, `["run-trace", runId]`
- ❌ nested objects, or inventing a new key shape for the same entity in a different file.

A new entity → a new flat key family. Reuse the existing family for the same entity so cache invalidation stays coherent.

## Logic out of JSX → custom hooks

Components should read like a description of the UI. Push stateful and business logic into a custom hook; let the component consume its result. This is the modern form of container/presentational separation — the hook is the "controller," the component is presentational.

```tsx
// ❌ logic tangled into the component
function PrPanel({ prId }) {
  const { data } = useQuery({ queryKey: ["reviews", prId], queryFn: () => api.get(/*…*/) });
  const grouped = /* 20 lines of grouping/derivation inline */;
  return /* JSX that also recomputes things */;
}

// ✅ logic in a hook, component stays presentational
function usePrFindings(prId: string) {
  const { data } = usePrReviews(prId);
  return useMemo(() => groupBySeverity(data), [data]); // derivation lives here
}
function PrPanel({ prId }: PrPanelProps) {
  const groups = usePrFindings(prId);
  return <FindingsList groups={groups} />;
}
```

Guidance (be pragmatic): if a component has only a few lines of logic, inlining is fine — don't manufacture a hook for two lines. Extract when logic grows, is reused, or needs to be testable in isolation. See [references.md](references.md) (patterns.dev, Controller Pattern, Felix Gerschau).

## Where hook helpers and constants go

A pure helper or constant used **only** by hooks in one domain file stays in that file (or a co-located `helpers.ts`). It graduates to `lib/` only when unrelated features share it (see [structure.md](structure.md)).

## Types

Domain types come from the Zod contracts in `@devdigest/shared`, re-exported through `lib/types.ts`:
```ts
import type { Review, Finding, PrMeta } from "@/lib/types";
```
Define a new local type only for **view-only** shapes that don't exist in the contracts (e.g. a row view-model). Never duplicate a contract type locally.
