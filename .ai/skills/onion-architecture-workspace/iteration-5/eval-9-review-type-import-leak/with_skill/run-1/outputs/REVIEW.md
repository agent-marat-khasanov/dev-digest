# Architecture Review — reports-slice (reports + schedules)

Reviewed against the `onion-architecture` skill (SKILL.md + layers.md, dependency-rule.md,
ports-and-adapters.md, examples.md). Scope: layering, dependency direction, ports & adapters,
composition-root wiring, boundary mapping, package boundaries only.

## Findings

### 1. Shared contract imports a Drizzle row type from a module repository (VIOLATION — hard rules 1 & 9, package boundary)

`server/src/vendor/shared/contracts/report.ts:3`

```ts
import type { ReportRunRow } from '../../modules/reports/repository'
```

and `report.ts:22-25`:

```ts
export interface ReportDetailDto extends ReportSummaryDto {
  latestRun?: ReportRunRow
  ...
}
```

This is the classic type-import leak that rule 9 calls out by name. `vendor/shared` is the
domain core and is hand-mirrored into `client/`; it may import only other domain code and Zod.
Here it names an infrastructure type (`typeof reviewRuns.$inferSelect`), which:

- points a domain → infrastructure dependency outward (rule 1), even though it is `import type`
  (rule 9: type-only imports count as dependencies);
- transitively couples the shared surface to `db/schema` and `drizzle-orm`, so the mirror into
  `client/` breaks (or drags server internals into a client bundle) on the next sync;
- means `ReportDetailDto` is not Zod-derived (there is no `reportDetailSchema`), so the detail
  endpoint (`modules/reports/routes.ts:23` returns `buildDetail` unparsed) ships a raw DB row —
  `workspaceId`, `Date` objects, internal columns — straight to HTTP, violating rule 5
  (map at the boundary) as a downstream symptom of the same flaw.

**Fix (at the contract):** declare the latest-run wire shape as a Zod schema in
`contracts/report.ts` (only wire-relevant fields; `z.string().datetime()` for timestamps),
define `reportDetailSchema` and derive `ReportDetailDto` via `z.infer`. Then map
`ReportRunRow` → that shape inside `modules/reports/helpers.ts` (`toReportDetailDto`), where
row → DTO conversion belongs. `helpers.ts` importing `ReportRunRow` from its own module's
repository is fine (rule 7/9 scope) — the violation is only the cross-boundary import in the
shared contract.

## Checked and found acceptable (no findings)

- **`adapters/clock/index.ts`, `adapters/report-renderer/index.ts`** — server-local ports
  declared beside their adapters (the `Tokenizer` precedent), not parked in `vendor/shared`;
  resolved via the container with `ContainerOverrides` slots. Correct per "Where does the
  port interface go?". The renderer importing `ReportSummaryDto` is an adapter depending
  inward on domain — allowed.
- **`platform/container.ts`** — composition root is the only place naming concretes
  (`SystemClock`, `TableReportRenderer`, services); eager + lazy resolution shapes match the
  documented pattern.
- **Services** (`reports/service.ts`, `schedules/service.ts`) — take the `Container`, construct
  their own module repository from `container.db` (matches the `AgentsService` exemplar),
  reach the clock only through the container port, no Fastify/SDK imports.
- **Routes** (both modules) — thin: validate with Zod, `getContext`, call service via the
  container, return; no business logic, no direct DB/adapter access. (Manual `.parse` instead
  of route `schema` options is Fastify mechanics, out of architecture scope.)
- **Repositories** — Drizzle confined to infrastructure; `$inferSelect` row types used as the
  module data model (rule 7); `schedules/repository.ts` importing `CreateScheduleInput` from
  contracts is an inward dependency — allowed.
- **`contracts/common.ts`, `contracts/schedule.ts`** — pure Zod, `z.infer`-derived types,
  no outward imports.
- **Module boundaries** — neither module imports the other's internals; row types stay inside
  their own module (except the one violation above).

## Verdict

One architecture violation, at `server/src/vendor/shared/contracts/report.ts`. The rest of the
slice follows the onion rules.
