# Architecture Review — reports-slice

Standard: onion-architecture skill snapshot (iteration 4). Scope: layering, dependency direction, ports & adapters, composition root, boundary mapping, package boundaries.

## Findings

### 1. Shared contract imports an infrastructure row type (dependency rule + boundary mapping)

**File:** `server/src/vendor/shared/contracts/report.ts:3,22-25`

```ts
import type { ReportRunRow } from '../../modules/reports/repository'
...
export interface ReportDetailDto extends ReportSummaryDto {
  latestRun?: ReportRunRow
  ...
}
```

This is a domain-layer file depending on the infrastructure ring — the dependency arrow points outward, which the dependency rule forbids regardless of `import type`. Consequences compound:

- `vendor/shared` is hand-synced and mirrored into `client/`, so a Drizzle `$inferSelect` row shape (including `workspaceId` and any internal columns) leaks into the client package boundary — and the client mirror cannot even resolve the `../../modules/...` path.
- `ReportsService.buildDetail` returns `runs[0]` unmapped, and the `/repos/:repoId/reports/detail` route returns it as-is: a raw DB row escapes to HTTP, bypassing the `helpers.ts` anti-corruption seam (rule 5, "map at the boundary").
- Because the row type is opaque to Zod, `ReportDetailDto` had to become a plain `interface`, so the detail endpoint has no response contract validation (note `routes.ts` parses the summary response but not the detail response).

**Fix:** define a Zod `reportLatestRunSchema` in `report.ts` with only the wire-relevant fields, derive `reportDetailSchema` from `reportSummarySchema`, and map `ReportRunRow` to it in `modules/reports/helpers.ts` (`toReportDetailDto`). Drop the repository import; `ReportRunRow` stays inside the reports module.

## Checked and acceptable (no findings)

- **Server-local ports beside their adapters** — `Clock` (`adapters/clock/index.ts`) and `ReportRenderer` (`adapters/report-renderer/index.ts`) are named only by the container and services, so declaring them next to their implementations follows the `Tokenizer` precedent; both are resolved via the `Container` with `ContainerOverrides` slots.
- **Composition root** — `platform/container.ts` is the only place constructing concretes (`SystemClock`, `TableReportRenderer`, `createDb`); services resolve `clock` through the container, never `new Date()`-wiring a vendor themselves. Services memoized on the container is consistent with repos living there.
- **Dependency direction elsewhere** — repositories import only `db/*`, Drizzle, and domain contracts (inward); services import domain + own repository + `Container`; routes import everything inward plus Fastify. No service imports a route; no route touches the DB.
- **Boundary mapping in schedules** — `toScheduleDto` maps `ScheduleRow` → `ScheduleDto` in `helpers.ts`; no row escapes that module.
- **Thin routes** — both `routes.ts` files only validate, read context, call the service, and return; business logic (period math, next-run computation, trend aggregation) lives in services/helpers.
- Per rule 7, the concrete repositories and `$inferSelect` row types used *within* the modules are acceptable; no repository-port ceremony required.

Non-architecture observations (out of scope, not findings): `reportRenderer` is wired but unused in this slice; routes hand-`parse` responses instead of Fastify response schemas — mechanics, not layering.

**Total: 1 architecture violation.**
