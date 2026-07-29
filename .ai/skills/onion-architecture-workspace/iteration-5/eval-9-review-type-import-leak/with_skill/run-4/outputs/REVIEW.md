# Architecture Review — reports-slice (reports + schedules)

Standard applied: `onion-architecture` skill (layer map, dependency rule, ports & adapters,
composition root, boundary mapping, package boundaries).

## Verdict

One architecture violation found. The rest of the slice follows the project's onion rules.

## Finding

### 1. Shared contract imports an infrastructure row type (rules 1 & 9 — dependency direction, type-only imports count)

`server/src/vendor/shared/contracts/report.ts:3` does

```ts
import type { ReportRunRow } from '../../modules/reports/repository'
```

and uses it at line 23:

```ts
export interface ReportDetailDto extends ReportSummaryDto {
  latestRun?: ReportRunRow
  ...
}
```

This is the classic leak rule 9 calls out by name: a `vendor/shared` contract (domain, the
innermost ring, mirrored into `client/`) naming a Drizzle `$inferSelect` row exported by a module
repository (infrastructure). Consequences:

- **Dependency direction inverted.** Domain now depends on infrastructure; `import type` counts
  exactly like a value import.
- **Package boundary broken.** `vendor/shared` is hand-synced into `client/` — the relative path
  `../../modules/reports/repository` does not exist there, so the mirror breaks on first sync, and
  server DB details leak into the client surface.
- **Boundary mapping bypassed (rule 5 fallout).** Because the contract legitimizes the raw row,
  `toReportDetailDto` (`modules/reports/helpers.ts:24-30`) passes `runs[0]` straight through and
  `GET /repos/:repoId/reports/detail` returns it to HTTP — internal columns (`workspaceId`, etc.)
  reach the wire unmapped.
- `ReportDetailDto` is a hand-written `interface` instead of a Zod-derived shape, so the detail
  route also has no response schema to serialize/validate against.

**Fix (one change, at the contract):** define the wire shape in Zod — e.g. a
`reportRunSummarySchema` with only the fields the client needs, and
`reportDetailSchema = reportSummarySchema.extend({ latestRun: reportRunSummarySchema.optional(), trend: ... })`,
with `ReportDetailDto = z.infer<...>`. Then map `ReportRunRow → latestRun` in
`modules/reports/helpers.ts` (where row↔DTO conversion belongs; `import type { ReportRunRow } from
'./repository'` is fine *inside* the module per rule 7). Reported once, at the contract, since the
helper/route symptoms disappear with this fix.

## Checked and found acceptable (not findings)

- **Routes are thin** (`modules/*/routes.ts`): validate with Zod, `getContext`, call service,
  return. No business logic, no DB access.
- **Services** take the `Container`, construct their own repository from `container.db`, and reach
  time only via the `Clock` port (`container.clock.now()`). No SDKs, no Fastify types.
- **`Clock` and `ReportRenderer` ports** are declared beside their adapters
  (`adapters/clock/index.ts`, `adapters/report-renderer/index.ts`) — correct per the server-local
  port rule (`Tokenizer` precedent): no package outside `server/` names them, and both have
  `ContainerOverrides` slots.
- **`report-renderer` importing `ReportSummaryDto`** from `vendor/shared` is an adapter depending
  inward on domain — allowed.
- **Repositories** import Drizzle + `db/*` and export `$inferSelect` row types used inside their
  own module (rule 7 allowance). `schedules/repository.ts` importing `CreateScheduleInput` from
  contracts is infrastructure depending inward — allowed.
- **`schedules` boundary mapping** is done right: `toScheduleDto` converts row → contract shape;
  routes parse responses through `scheduleSchema`.
- **Composition root** (`platform/container.ts`) is the only file wiring concretes
  (`SystemClock`, `TableReportRenderer`, `createDb`, services as memoized getters) and honors
  overrides — the sanctioned pattern.
