# Architecture Review — "exports" feature (port-placement fixture)

Scope: layering, dependency direction, ports & adapters, port placement, composition-root wiring
only. Calibrated against the real `server/src` conventions (ports in `vendor/shared/adapters.ts`,
all concretes wired in `platform/container.ts`, no env access outside `platform/config`).

## Findings

### 1. Service instantiates a concrete adapter (`new FsArchiveStore`)
`server/src/modules/exports/service.ts:20-23`

`ExportsService` (application layer) imports the infrastructure class `FsArchiveStore` and
constructs it inline, even though the `ArchiveStore` port is correctly defined in
`vendor/shared/adapters.ts`. This bypasses dependency inversion and the composition root: the
container is the only place allowed to wire concretes, and it currently wires neither the archive
adapter nor the exports service graph (the route resolves `container.exportsService`, which the
proposed container excerpt never provides an `ArchiveStore` for).

**Fix:** inject `archive: ArchiveStore` via the service constructor; construct `FsArchiveStore`
in `platform/container.ts` (with a test-override slot, matching the other adapters).

### 2. `process.env` read inside the application layer
`server/src/modules/exports/service.ts:21-22`

The service reads `ARCHIVE_DIR` and `EXPORT_SIGNING_SECRET` from the environment. Configuration
and secrets are external details: in this project they are loaded once at the composition root
(`loadConfig()` / `SecretsProvider`) and injected. No module code touches `process.env`.

**Fix:** add both values to `AppConfig` (the signing secret arguably belongs in
`SecretsProvider`) and pass them to `FsArchiveStore` at construction time in the container.
Fixing finding 1 this way removes the env access from the service automatically.

### 3. `Clock` port defined in infrastructure instead of `vendor/shared`
`server/src/adapters/clock/index.ts:1-4`

The `Clock` interface — a port the application layer depends on — is declared inside the adapters
directory next to its `SystemClock` implementation. As a result `ExportsService`
(`service.ts:1`) and the container import their port *type* from infrastructure, so the
application layer's source dependency points outward. Every other port (`LLMProvider`,
`GitHubClient`, `SecretsProvider`, `ArchiveStore`) lives in `vendor/shared/adapters.ts`.

**Fix:** move `interface Clock` to `server/src/vendor/shared/adapters.ts`; keep `SystemClock` in
`adapters/clock` implementing the shared port, and import the type from `vendor/shared` in the
service and container.

## Explicitly not flagged (acceptable in this project)

- `ExportsRepository` as a concrete class consumed by the service — real services construct their
  module repository from `container.db` (e.g. `ReviewService`); repositories are not behind
  shared ports here.
- Helpers/DTO mapping using Drizzle `$inferSelect` row types — matches the existing
  `helpers.ts` / `db/rows` pattern in real modules.
- `ArchiveStore` interface placement in `vendor/shared/adapters.ts` — correct port placement.
- Route resolving the service from the request-scoped container context and validating with the
  shared Zod contract — matches project conventions.
