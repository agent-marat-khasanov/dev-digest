# Architecture Review — "exports" feature (port-placement fixture)

Standard applied: onion-architecture skill snapshot (iteration 4) — layering, dependency rule,
ports & adapters, port placement, composition-root wiring.

## Findings

### 1. Service constructs an adapter and reads env config (rules 3 & 6)

`server/src/modules/exports/service.ts:20-23` (import at line 2)

`ExportsService.exportRunFindings` does `new FsArchiveStore(process.env.ARCHIVE_DIR ?? …, process.env.EXPORT_SIGNING_SECRET ?? …)` inside the application layer. This:

- wires a concrete infrastructure class into the application ring (the service imports
  `FsArchiveStore`, not the `ArchiveStore` port);
- pulls configuration and a signing secret out of `process.env` in a service — config/secret
  resolution belongs to the composition root (`platform/container.ts` + `SecretsProvider`);
- bypasses the container entirely: there is no `archive` member on `Container` and no
  `ContainerOverrides` slot, so tests cannot swap the store for a mock.

**Fix:** declare the archive store as a container-provided port. Add an `archive` getter to
`Container` (built from `config`/`secrets`, honoring a new `ContainerOverrides.archive` field) and
inject the port into `ExportsService` the same way `Clock` already is. The service should never
name `FsArchiveStore` or touch `process.env`.

### 2. Server-only port `ArchiveStore` parked in `vendor/shared/adapters.ts` (port placement)

`server/src/vendor/shared/adapters.ts:16-20`

`vendor/shared/adapters.ts` is for ports that a package **outside** `server/` must name
(`LLMProvider`, `GitHubClient`, `SecretsProvider` — named by `reviewer-core`). Nothing under
`client/` or `reviewer-core/` references the exports feature, so `ArchiveStore` is a server-local
port. Putting it in the hand-synced, client-mirrored shared surface buys no decoupling — the
decoupling comes from the interface plus the container, not the folder — and widens a surface every
package pays for.

**Fix:** move the `ArchiveStore` interface to `adapters/archive/index.ts`, declared beside
`FsArchiveStore` — the `Tokenizer` (and, in this slice, `Clock`) precedent. Update the adapter,
service, and container imports.

## Explicitly checked and found acceptable

- `Clock` port declared beside `SystemClock` in `adapters/clock/index.ts`, wired eagerly in the
  container with a `ContainerOverrides.clock` slot, injected into the service — the correct
  server-local-port pattern.
- `routes.ts` is thin: validates params, reads context, calls the service via the container,
  returns the contract shape. No business logic at the edge.
- `repository.ts` is conventional infrastructure (Drizzle, workspace-scoped run lookup); row types
  via `$inferSelect` are an allowed module data model (rule 7).
- `helpers.ts` maps rows → `ExportDto` at the boundary (rule 5); `renderFindingsPdf` is pure,
  within-module logic — no layer crossing.
- `adapters/archive/fs.ts` imports the port to implement it — dependency points inward.
- `contracts/export.ts` is Zod-only domain code.

## Summary

2 architecture violations: adapter construction + env/secret access inside the application layer
(fix by wiring `ArchiveStore` through the composition root), and a server-only port misplaced in
the shared package surface (fix by moving it beside its adapter).
