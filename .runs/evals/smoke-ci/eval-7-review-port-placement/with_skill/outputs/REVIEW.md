# Architecture review — `exports` feature (port-placement fixture)

Standard applied: `.ai/skills/onion-architecture/` (SKILL.md + layers, dependency-rule,
ports-and-adapters, examples). Scope: layering, dependency direction, ports & adapters,
composition-root wiring, boundary mapping only.

## Findings (3)

### 1. `ArchiveStore` port is parked in `vendor/shared/adapters.ts`
`server/src/vendor/shared/adapters.ts:16-20`

The skill's placement question is: *does any package outside `server/` have to name this type?*
For `ArchiveStore` the answer is no — only the exports service and `adapters/archive/fs.ts` name it;
nothing under `client/` or `reviewer-core/` references the exports feature. `vendor/shared` is the
hand-synced surface mirrored into other packages, so a server-only port there widens that surface
for nothing. The correct pattern is already demonstrated in this very slice: `Clock` is declared
beside its adapter in `adapters/clock/index.ts` (the `Tokenizer` precedent).

**Fix:** move the `ArchiveStore` interface to `server/src/adapters/archive/index.ts`, exported
alongside `FsArchiveStore`; the container imports it from there.

### 2. Service constructs the adapter itself — never wired in the composition root
`server/src/modules/exports/service.ts:20-23`

`ExportsService` imports the concrete `FsArchiveStore` and `new`s it inline. This violates hard
rules 3 and 6: all external I/O is reached through container-resolved ports, and only
`platform/container.ts` may know concrete adapter classes. Per the dependency table, a service may
import domain, its own repository, and the `Container` — not adapter concretes. As proposed, the
container wires no `ArchiveStore` at all and `ContainerOverrides` has no slot for it, so tests
cannot swap the filesystem archive for a mock — the exact property the architecture exists to buy.
(Contrast with `Clock`, which is injected and overridable — done right.)

**Fix:** inject the `ArchiveStore` port into `ExportsService` (constructor parameter, like
`Clock`); construct `FsArchiveStore` in `platform/container.ts`; add `archive?: ArchiveStore` to
`ContainerOverrides`.

### 3. `process.env` config and a signing secret read in the application layer
`server/src/modules/exports/service.ts:21-22`

The service reads `ARCHIVE_DIR` and `EXPORT_SIGNING_SECRET` straight from `process.env`.
Configuration resolution belongs to the composition root (`loadConfig` → `AppConfig`), and secrets
must flow through the `SecretsProvider` port — every other adapter in the container receives
`this.secrets`, while this signing secret (complete with a hardcoded `'dev-secret'` fallback)
bypasses that path entirely. Environment access inside the application ring is exactly the leak the
container pattern isolates.

**Fix:** when constructing `FsArchiveStore` in the container, take the directory from `AppConfig`
and the signing secret from the `SecretsProvider`; the service never touches `process.env`.

## What was checked and found acceptable

- `routes.ts` is thin: Zod param validation, `getContext`, one service call, contract-shaped
  response (`exportSchema.parse`). No business logic, no direct DB/adapter access.
- `repository.ts`: Drizzle only, workspace-scoped `getRun`, `$inferSelect` row types as the
  module's data model (rule 7 allowance).
- `helpers.ts`: row → DTO mapping at the boundary (`toExportDto`); `renderFindingsPdf` is pure,
  I/O-free, module-local logic — acceptable placement.
- `adapters/clock/`: server-local port declared beside its adapter, wired eagerly in the container
  with a `ContainerOverrides.clock` slot — the model example this fixture's archive port should
  have followed.
- `adapters/archive/fs.ts` itself depends inward (implements the port); its problems are where the
  port lives (finding 1) and how it's constructed/configured (findings 2–3), not its own imports.

Note: findings 2 and 3 surface on adjacent lines but are distinct rules — one is *who constructs
the adapter*, the other is *where its config and secret come from*. Both resolve in the same
container wiring.
