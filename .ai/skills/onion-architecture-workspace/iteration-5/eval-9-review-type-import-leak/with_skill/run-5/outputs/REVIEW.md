# Architecture Review — reports-slice (reports + schedules)

Reviewed against the `onion-architecture` skill (SKILL.md + layers.md, dependency-rule.md,
ports-and-adapters.md, examples.md). Scope: layering, dependency direction, ports & adapters,
composition-root wiring, boundary mapping, package boundaries only.

## Findings

### 1. Shared contract imports a Drizzle row type from module infrastructure (rules 1 & 9; consequence: rule 5)

**`server/src/vendor/shared/contracts/report.ts:3, 22–25`**

```ts
import type { ReportRunRow } from '../../modules/reports/repository'
...
export interface ReportDetailDto extends ReportSummaryDto {
  latestRun?: ReportRunRow
  ...
}
```

`vendor/shared` is the domain core: it may import only other domain code and Zod, never
`modules/*` or `db/*`. The dependency rule applies to `import type` exactly as to value imports
(SKILL.md rule 9 names this exact leak as the classic case). The damage:

- **Direction inverted.** Domain now depends outward on infrastructure (`modules/reports/repository`
  → `db/schema` → drizzle-orm).
- **Package mirror broken.** `vendor/shared` is hand-synced into `client/`; a contract naming a
  server-only Drizzle row type cannot compile on the client side and leaks server details
  (`workspaceId`, internal columns) into the shared surface.
- **Raw row escapes to HTTP (rule 5).** Because of this contract shape, `toReportDetailDto`
  (`modules/reports/helpers.ts:29`) passes the row through unmapped and
  `GET /repos/:repoId/reports/detail` (`modules/reports/routes.ts:23`) returns it verbatim —
  and no `reportDetailSchema` can exist, so the detail response has no Zod contract at all.

**Fix.** In the contract, express the latest-run wire shape in Zod terms
(e.g. `reportLatestRunSchema` with only the fields the client needs, a full
`reportDetailSchema = reportSummarySchema.extend({ latestRun: ..., trend: ... })`,
`ReportDetailDto = z.infer<typeof reportDetailSchema>`), and delete the repository import.
Map `ReportRunRow` → that shape in `modules/reports/helpers.ts` — the sanctioned boundary seam.
One underlying violation; the symptoms in `helpers.ts` and `routes.ts` disappear with this fix.

## Checked and found sound

- **Ports & adapters:** `Clock` and `ReportRenderer` are server-local ports declared beside their
  implementations (`adapters/clock/index.ts`, `adapters/report-renderer/index.ts`) — correct per the
  `Tokenizer` precedent; no package outside `server/` names them, so `vendor/shared/adapters.ts`
  would be the wrong home. Both are resolved via the `Container` with `ContainerOverrides` slots.
- **Dependency direction elsewhere:** repositories import shared contracts and db (inward — fine);
  the report-renderer adapter imports a shared DTO (infrastructure → domain — fine); services import
  domain contracts, their own repository, and the `Container` only.
- **Composition root:** `platform/container.ts` is the only file constructing concretes
  (`SystemClock`, `TableReportRenderer`, `createDb`); services reach `clock` through the container,
  never `new Date()`-style ambient time in the service ring.
- **Thin routes:** both `routes.ts` files validate, read context, call the service, return —
  no business logic, no direct DB or adapter access.
- **Boundary mapping:** the schedules module maps row → DTO correctly in `helpers.ts`
  (`toScheduleDto`), including `Date` → ISO string.
- Manual `.parse()` in handlers instead of Fastify route schemas is a Fastify-mechanics topic
  (out of scope for this architecture review), not a layering violation.

**Total: 1 architecture violation.**
