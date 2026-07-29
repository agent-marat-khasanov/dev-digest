# Architecture Review — reports-slice

Standard applied: onion-architecture skill snapshot (iteration 4) — dependency rule, layers, ports & adapters, composition root, boundary mapping.

## Findings (1)

### 1. Shared domain contract imports infrastructure (type import leak)

`server/src/vendor/shared/contracts/report.ts:3` imports `ReportRunRow` from
`../../modules/reports/repository` and uses it as the type of
`ReportDetailDto.latestRun` (line 23).

This is a dependency-direction violation with three consequences:

- **Dependency rule.** `vendor/shared/` is the domain core; it may import only other domain code
  and Zod. Importing a `repository.ts` type points the arrow outward — the core now knows about
  Drizzle's `$inferSelect` row for `reviewRuns`.
- **Boundary mapping (rule 5).** Because the wire contract *is* the row type, the raw Drizzle row
  (`runs[0]` in `reports/service.ts:27`) travels unmapped through `toReportDetailDto` straight to
  HTTP, leaking internal columns (e.g. `workspaceId`) instead of a mapped DTO.
- **Package boundary.** `vendor/shared/` is hand-synced into `client/`. This import would drag
  `server/src/modules/**` and `db/schema` into the client mirror, which cannot resolve them.

The `import type` qualifier does not excuse it — the *type* dependency is exactly what the mirrored
shared surface pays for.

**Fix (belongs in the contract):** define a `latestRun` shape in the contract itself — a Zod schema
(or plain domain type) listing only the fields the wire needs — and have
`modules/reports/helpers.ts` map `ReportRunRow` → that shape. Delete the repository import.

## Checked and found compliant

- **Layer direction elsewhere:** routes → service → repository all point inward; repositories and
  adapters import only domain contracts (`schedules/repository.ts` importing `CreateScheduleInput`
  is inward and fine).
- **Ports & adapters:** `Clock` and `ReportRenderer` are server-local ports declared beside their
  adapters (`adapters/clock/index.ts`, `adapters/report-renderer/index.ts`) — exactly the
  sanctioned pattern for ports no outside package names; both are resolved only via the
  `Container` and have `ContainerOverrides` slots.
- **Composition root:** `platform/container.ts` is the only file constructing concretes
  (`SystemClock`, `TableReportRenderer`, services); services receive the container and never
  `new` an adapter. Services constructing their own module repository with `container.db` matches
  the project's sanctioned pattern.
- **Thin routes:** both `routes.ts` files validate, read context, call the service, return — no
  business logic, no direct DB or adapter access.
- **Boundary mapping (schedules):** `toScheduleDto` maps row → contract in `helpers.ts`; no raw
  row reaches HTTP in the schedules module.

Findings: **1**.
