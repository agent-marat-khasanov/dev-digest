# Architecture Review — reports-slice (reports + schedules)

Standard applied: `onion-architecture` skill (SKILL.md + layers.md, dependency-rule.md,
ports-and-adapters.md, examples.md). Scope: layering, dependency direction, ports & adapters,
composition-root wiring, boundary mapping, package boundaries. One violation found.

## Findings

### 1. Shared contract imports a Drizzle row type from a server module (rules 1, 9; rule 5 fallout)

`server/src/vendor/shared/contracts/report.ts:3`

```ts
import type { ReportRunRow } from '../../modules/reports/repository'
...
export interface ReportDetailDto extends ReportSummaryDto {
  latestRun?: ReportRunRow   // line 23
```

This is the classic type-import leak the skill calls out explicitly (rule 9: "type-only imports
count as dependencies"). Three consequences, all from this one import:

- **Dependency direction inverted.** The domain layer (`vendor/shared/contracts`) names an
  infrastructure type (`typeof reviewRuns.$inferSelect` re-exported by the repository). Inner
  layers must never import outer ones — `import type` does not exempt it.
- **Package boundary broken.** `vendor/shared` is mirrored into `client/`; the mirror has no
  `modules/reports/repository`, so the synced copy cannot compile, and server DB details
  (workspaceId, internal columns) leak into the client-visible surface.
- **No boundary mapping (rule 5).** `ReportDetailDto.latestRun` makes the raw Drizzle row the
  wire shape: `ReportsService.buildDetail` passes `runs[0]` through
  `toReportDetailDto` unmapped and the `/repos/:repoId/reports/detail` route returns it as-is.
  Note `ReportDetailDto` is also the only contract shape not derived from Zod — a direct symptom
  of the leak, since a row type cannot be expressed as a contract schema.

**Fix (in the contract + reports helpers):** declare a Zod schema for the run summary the client
actually needs (id, createdAt, findingCount, …) in `report.ts`, define
`reportDetailSchema = reportSummarySchema.extend({ latestRun: ..., trend: ... })` with
`ReportDetailDto = z.infer<...>`, and map `ReportRunRow` → that shape in
`modules/reports/helpers.ts` (`toReportDetailDto`). The repository keeps its row type; only the
contract stops naming it.

Reported once, at the file where the fix belongs; the same violation surfaces in
`modules/reports/helpers.ts:26` and `modules/reports/service.ts:27`.

## Checked and found acceptable (not reported)

- **Row types used inside their own module** (`reports/helpers.ts`, `schedules/helpers.ts`
  importing `./repository` types) — explicitly allowed by rules 7/9: the violation is crossing a
  layer/package boundary, not the syntax.
- **Server-local ports beside their adapters** (`Clock` in `adapters/clock/index.ts`,
  `ReportRenderer` in `adapters/report-renderer/index.ts`) — matches the `Tokenizer` precedent;
  no package outside `server/` names them, both resolved from the `Container` with
  `ContainerOverrides` slots.
- **`report-renderer` importing `ReportSummaryDto`** — infrastructure importing domain: inward,
  allowed.
- **Container wiring** (`platform/container.ts`) — composition root may know every concrete
  (adapters, services, db); services resolve `clock` via the container and construct only their
  own repository, per the `AgentsService` pattern.
- **Routes** — thin in both modules: validate, `getContext`, call service, return; no business
  logic, no DB access, no adapter construction.
- **Repositories** — concrete (no premature port interface), Drizzle-only, workspace-scoped;
  `SchedulesRepository` importing the `CreateScheduleInput` contract is an inward dependency.
- **Contracts `common.ts` / `schedule.ts`** — Zod-only, no outward imports.

## Verdict

Structurally sound slice except for the single contract → repository type leak, which should be
fixed before `vendor/shared` is synced to `client/`.
