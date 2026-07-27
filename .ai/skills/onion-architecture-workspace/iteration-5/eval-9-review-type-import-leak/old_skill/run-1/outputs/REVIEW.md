# Architecture Review — reports-slice

Standard applied: onion-architecture skill snapshot (iteration 4) — dependency rule, layer map,
ports & adapters, composition root, boundary mapping.

## Findings (1)

### 1. Domain contract imports an infrastructure row type (dependency rule; package boundary; map-at-boundary)

`server/src/vendor/shared/contracts/report.ts:3` imports `ReportRunRow` from
`../../modules/reports/repository`, and `report.ts:22-25` embeds it in the wire contract:

```ts
import type { ReportRunRow } from '../../modules/reports/repository'
// ...
export interface ReportDetailDto extends ReportSummaryDto {
  latestRun?: ReportRunRow
  trend: Array<{ week: string; findings: number }>
}
```

Why this is a violation (three consequences of one import):

- **Dependency direction.** `vendor/shared` is the domain core; it may import only other domain
  code, Zod, and plain TS. Importing from `modules/reports/repository.ts` (infrastructure) points
  outward. `import type` does not make it legal — the contract is now *defined in terms of* the
  Drizzle table shape, so any schema change ripples into the shared contract.
- **Package boundary.** `vendor/shared` is mirrored into `client/`. In the client mirror the path
  `../../modules/reports/repository` does not exist, so the shared surface no longer stands alone —
  server DB details leak into what every package imports.
- **Map at the boundary.** Because `latestRun` *is* the raw row, `toReportDetailDto`
  (`modules/reports/helpers.ts:24-30`) passes `runs[0]` straight through and the detail route
  returns it to HTTP — internal fields (`workspaceId`, DB-internal columns) escape to the wire
  instead of being mapped in `helpers.ts`.

**Fix.** In `report.ts`, define `latestRun` as a Zod schema in domain terms (only the fields the
client needs, e.g. id, author, findingCount, createdAt as ISO string) and derive a full
`reportDetailSchema`/`ReportDetailDto` from Zod like the summary. Then map `runs[0]` to that shape
in `modules/reports/helpers.ts` — the same row→DTO seam already used for schedules.

Reported once, at `report.ts`, where the fix belongs; `helpers.ts:29` and the detail route are the
same underlying violation surfacing downstream.

## What was checked and found conforming (not violations)

- **Ports beside adapters** — `Clock` (`adapters/clock/index.ts`) and `ReportRenderer`
  (`adapters/report-renderer/index.ts`) are server-local ports declared next to their
  implementations, matching the `Tokenizer` precedent; no outside package names them, so
  `vendor/shared/adapters.ts` is correctly not widened.
- **Composition root** — `platform/container.ts` is the only place constructing concretes
  (`SystemClock`, `TableReportRenderer`, `createDb`, services), with `ContainerOverrides` slots for
  db/clock/renderer. Services memoized on the container is sanctioned wiring.
- **Services** — resolve time via the `container.clock` port (no `new Date()` in application code),
  construct only their own module's repository, never touch Fastify types.
- **Routes** — thin: validate with Zod, read context, call service, return; no business logic, no
  direct DB or adapter construction.
- **Repositories** — Drizzle only, workspace-scoped, row types via `$inferSelect` used as the
  module-internal model (rule-7 allowance). `schedules/repository.ts` importing the
  `CreateScheduleInput` contract is an inward (infrastructure → domain) dependency — allowed.
- **Helpers** — `reports/helpers.ts` and `schedules/helpers.ts` importing same-module row types is
  exactly their job (the row↔DTO seam).
- **`report-renderer` adapter importing `ReportSummaryDto`** — adapter → domain contract is inward;
  allowed.

Note (not a violation, just an observation): `reportRenderer` is wired in the container but not yet
consumed by any service in this slice.
