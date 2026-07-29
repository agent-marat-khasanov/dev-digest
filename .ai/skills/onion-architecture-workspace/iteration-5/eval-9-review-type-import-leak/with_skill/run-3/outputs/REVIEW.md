# Architecture Review — reports-slice

Scope: onion layering, dependency direction, ports & adapters, composition-root wiring, boundary
mapping, package boundaries (per `.ai/skills/onion-architecture`).

## Findings

### 1. Shared contract imports a server infrastructure type (rules 1 & 9) — `server/src/vendor/shared/contracts/report.ts:3,22-25`

```ts
import type { ReportRunRow } from '../../modules/reports/repository'
…
export interface ReportDetailDto extends ReportSummaryDto {
  latestRun?: ReportRunRow
```

This is the classic type-import leak the skill calls out explicitly: a `vendor/shared` contract
naming a Drizzle `$inferSelect` row from `modules/*`. Type-only imports count as dependencies
(rule 9), so the innermost layer now depends on infrastructure (rule 1), and — because
`vendor/shared` is hand-mirrored into `client/` — the mirror breaks on the next sync (the client
has no `modules/reports/repository`). It also makes `ReportDetailDto` a hand-written interface
rather than a Zod-derived shape, so the detail endpoint has no enforceable wire contract.

**Fix:** remove the import; add a `reportRunSummarySchema` (only wire-relevant fields) and a
`reportDetailSchema` in the contract, derive `ReportDetailDto` via `z.infer`.

### 2. Raw Drizzle row escapes to HTTP (rule 5) — `server/src/modules/reports/helpers.ts:24-30`

`toReportDetailDto` passes the untouched `ReportRunRow` through as `latestRun`, and
`GET /repos/:repoId/reports/detail` returns the result without a response schema — so internal
columns (`workspaceId`, timestamps, any future column) go straight to the wire. This is the
runtime facet of finding 1, but the mapping fix lives here: convert the row to the contract's
`latestRun` shape in `helpers.ts` (the anti-corruption seam), never hand HTTP a raw row.

## Checked and clean

- **Within-module row imports** — `reports/helpers.ts` and `schedules/helpers.ts` importing
  `XRow` from their own `./repository` is explicitly allowed (rules 7 & 9 scope).
- **Server-local ports** — `Clock` and `ReportRenderer` are declared beside their adapters
  (`adapters/clock/index.ts`, `adapters/report-renderer/index.ts`); no package outside `server/`
  names them, matching the `Tokenizer` precedent. Both are resolved from the `Container` with
  `ContainerOverrides` slots.
- **Composition root** — `platform/container.ts` is the only place constructing concretes;
  services resolve `container.clock`, never `new SystemClock()` inline.
- **Dependency direction elsewhere** — repositories import only Drizzle/db/contracts (inward);
  adapters import only contracts; services import domain + own repo + `Container`; routes are
  thin (validate, `getContext`, call service, return).
- **Boundary mapping (schedules)** — `toScheduleDto` properly maps row → contract shape.

**Total: 2 findings.**
