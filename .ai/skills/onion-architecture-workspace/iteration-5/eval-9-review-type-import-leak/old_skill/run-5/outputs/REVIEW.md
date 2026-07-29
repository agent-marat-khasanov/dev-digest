# Architecture Review — reports-slice

Standard: onion-architecture skill snapshot (iteration 4). Scope: layering, dependency direction,
ports & adapters, composition-root wiring, boundary mapping, package boundaries.

## Findings

### 1. `vendor/shared/contracts/report.ts` imports a repository row type (dependency rule, hard rules 1/2/5)

`server/src/vendor/shared/contracts/report.ts:3`

```ts
import type { ReportRunRow } from '../../modules/reports/repository'
...
export interface ReportDetailDto extends ReportSummaryDto {
  latestRun?: ReportRunRow
```

This single import breaks the architecture in three compounding ways:

1. **Direction.** Domain (`vendor/shared`) imports infrastructure (`modules/reports/repository.ts`).
   The dependency-rule table is explicit: `vendor/shared` may import other domain code, Zod, and
   plain TS — never a `repository`. A `type`-only import is still a source dependency pointing
   outward, and it transitively pulls `drizzle-orm` and `db/schema` into the shared surface, both on
   the forbidden-imports checklist for the core.
2. **Boundary mapping.** `ReportDetailDto.latestRun` is the raw Drizzle `$inferSelect` row, so
   `ReportsService.buildDetail` / `toReportDetailDto` hand `runs[0]` straight to HTTP unmapped —
   internal columns (`workspaceId`, etc.) escape to the wire. Rule 5: hand HTTP the contract shape,
   never a raw row. It also forces `ReportDetailDto` to be a plain interface — it cannot be a Zod
   schema, so the detail endpoint has no wire contract at all.
3. **Package boundary.** `vendor/shared` is mirrored into `client/`, so the client mirror now
   references server-only files (`modules/.../repository.ts` → `db/schema`), which do not exist
   there. Server persistence internals leak into a client bundle.

**Fix (one move):** declare the run shape in domain terms inside the contract — e.g. a
`reportRunSchema` Zod object with only the fields a report consumer needs — use it for `latestRun`,
turn `ReportDetailDto` into `z.infer` of an extended schema, and add a `toReportRunDto(row)` mapper
in `modules/reports/helpers.ts`. Delete the repository import from `vendor/shared`.

This is one underlying violation; its symptoms are also visible in `modules/reports/helpers.ts`
(`toReportDetailDto`) and `modules/reports/service.ts` (`buildDetail`), but the fix belongs in the
contract, so it is reported once.

## Verified clean (not findings)

- **Ports & adapters:** `Clock` and `ReportRenderer` are server-local ports declared beside their
  implementations (`adapters/clock/index.ts`, `adapters/report-renderer/index.ts`) — the Tokenizer
  precedent; correctly kept out of `vendor/shared` since no other package names them.
- **Composition root:** `platform/container.ts` is the only file wiring concretes; both adapters
  honor `ContainerOverrides`; services are memoized on the container (rule 6 sanctions wiring
  services through the Container).
- **Application layer:** both services take the `Container`, construct their own module repository,
  and reach the clock via `container.clock` (port, not `new Date()` inline); no Fastify types.
- **Presentation:** both route files are thin — validate with Zod, `getContext`, call service,
  return; no business logic, no direct DB/adapter construction.
- **Infrastructure:** repositories are concrete (rule 7 allowance), workspace-scoped, use
  `$inferSelect` rows as the module data model; `report-renderer` importing a shared contract type
  is a correct inward dependency.
- **Boundary mapping elsewhere:** `toScheduleDto` and `toReportSummaryDto` correctly convert rows to
  contract DTOs in `helpers.ts`.

**Total: 1 architecture violation.**
