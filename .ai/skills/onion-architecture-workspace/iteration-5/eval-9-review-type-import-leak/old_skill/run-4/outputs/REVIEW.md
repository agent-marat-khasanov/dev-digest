# Architecture Review — reports-slice

Standard: onion-architecture skill snapshot (iteration 4). Scope: layering, dependency direction,
ports & adapters, composition-root wiring, boundary mapping, package boundaries.

## Findings: 1

### 1. Shared contract imports a repository row type (dependency rule; boundary mapping)

**File:** `server/src/vendor/shared/contracts/report.ts`, lines 3 and 23

```ts
import type { ReportRunRow } from '../../modules/reports/repository'
// ...
export interface ReportDetailDto extends ReportSummaryDto {
  latestRun?: ReportRunRow
```

The domain layer (`vendor/shared/contracts`) takes a source dependency on infrastructure
(`modules/reports/repository.ts`), transitively on `db/schema` and Drizzle. This is the exact
inversion the dependency rule forbids: "vendor/shared importing from adapters/ [or modules] is a
violation" — `import type` is still a source dependency. Consequences:

- `vendor/shared` is mirrored into `client/`, so a server-only Drizzle row type (and every internal
  column, e.g. `workspaceId`) leaks into the client package surface.
- `ReportDetailDto` cannot be a Zod schema, so the detail endpoint has no wire contract; the route
  (`modules/reports/routes.ts:23`) returns the DTO unparsed.
- The raw `ReportRunRow` escapes to HTTP via `latestRun` with no mapping in `helpers.ts` — a
  violation of "map at the boundary: hand HTTP the Zod contract shape, never a raw Drizzle row."

**Fix (one fix, three symptoms):** declare a `reportRunSchema` (only the fields the wire needs) in
`report.ts`, make `reportDetailSchema` a full Zod contract using it, and map `ReportRunRow -> DTO`
in `modules/reports/helpers.ts` (`toReportDetailDto`). The row type then stays inside the module.

## Checked and found acceptable (per the snapshot — deliberately not flagged)

- `Clock` and `ReportRenderer` are server-local ports declared beside their adapters
  (`adapters/clock/index.ts`, `adapters/report-renderer/index.ts`) — the `Tokenizer` precedent:
  no package outside `server/` names them, so `vendor/shared/adapters.ts` would be the wrong home.
  Both are resolved from the `Container` with `ContainerOverrides` slots.
- Services take the `Container` and construct their own repositories
  (`new ReportsRepository(container.db)`) — matches the `AgentsService` exemplar.
- Repositories import shared contracts (`CreateScheduleInput`) — an inward dependency; allowed.
- `helpers.ts` importing row types from its own module's repository is exactly the boundary-mapping
  job (`toAgentDto(row: AgentRow)` exemplar).
- `Container` knowing every concrete class and memoizing services is the composition root's
  privilege; the service -> container import is type-only, so there is no runtime cycle.
- Routes are thin: validate, `getContext`, call service, return. Manual `.parse` instead of the
  Fastify schema option is route mechanics, not a layering issue.
