# Components

## Folder-per-component + barrel

Every non-trivial component is a **folder**, not a loose file:

```
PRRow/
  PRRow.tsx            # the component + its prop type, in one file
  FindingsPopover.tsx  # co-located sub-piece used only by PRRow
  index.ts             # barrel — the folder's public API
```

`index.ts` exposes only what's public:
```ts
export { PRRow } from "./PRRow";
```

Consumers import the **barrel**, never a deep file path:
```ts
import { PRRow } from "./_components/PRRow";          // ✅
import { PRRow } from "./_components/PRRow/PRRow";     // ❌ reaches past the public API
```

Why: the barrel is a contract. Internal files (`FindingsPopover.tsx`) can be renamed or split without touching any consumer.

## Shared vs page-private

| Component reach | Location |
|---|---|
| One route only | `app/<route>/_components/` |
| One component only | nested `_components/` inside that component |
| 2+ routes | `src/components/<name>/` (shared chrome) |

Real shared components: `src/components/app-shell/`, `page-shell/`, `diff-viewer/`, `mermaid-diagram/`.
Real page-private: `app/repos/[repoId]/pulls/_components/PRRow/`, `app/agents/_components/AgentCard/`.

**Start private.** A component is born inside the route that needs it. Promote to `src/components/` only when a second route actually imports it — not preemptively.

## Naming

- **Files & components:** PascalCase — `PRRow.tsx`, `FindingsPanel.tsx`, `AgentCard.tsx`.
- **Functions, helpers, variables:** camelCase — `sizeOf`, `relativeTime`, `formatCost`.
- **Prop types:** PascalCase, co-located in the component file (`PRRowProps` next to `PRRow`). No separate `types.ts` for a single component's props.
- **Co-located files:** lowercase domain names — `constants.ts`, `helpers.ts`, `styles.ts`.

## Splitting a component — when

Split when a piece is **independently nameable and reusable within the feature**, or when one file mixes two clear concerns. Don't split for line count alone. The CLAUDE.md rule applies: *three similar lines beat a premature abstraction.*

- `PRRow` + `FindingsPopover` are split because the popover is a distinct interactive piece.
- A 10-line presentational sub-block used once stays inline.

## Styles

Components with non-trivial styling export a style object (conventionally `s`) from a co-located `styles.ts`:
```ts
// styles.ts
export const s = {
  row: { display: "grid", gridTemplateColumns: GRID } satisfies CSSProperties,
  // …
};
```
Style values key off CSS variables from the design system (`var(--warn)`, `var(--ok)`) rather than hard-coded colors. Don't add per-component `.css` files — the token layer lives in `vendor/ui`.

## Don't rebuild the design system

UI primitives (Button, Badge, Modal, Drawer, Tabs, charts…) come from `@devdigest/ui`. Import them — never hand-roll a local equivalent and never edit `vendor/ui/`.
```ts
import { Button, Badge } from "@devdigest/ui";
```
