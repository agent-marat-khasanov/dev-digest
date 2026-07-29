# Architecture review — proposed `exports` feature (signed PDF download)

Standard applied: `onion-architecture` skill (SKILL.md + layers.md, dependency-rule.md,
ports-and-adapters.md, examples.md). Scope: layering, dependency direction, ports & adapters,
port placement, composition-root wiring only.

## Findings

### 1. `ArchiveStore` port parked in `vendor/shared/adapters.ts` (port placement)

`server/src/vendor/shared/adapters.ts:16-20`

The placement question is "does any package outside `server/` have to name this type?" Here the
answer is no: `ArchiveStore` is named only by `modules/exports/service.ts`, the adapter
`adapters/archive/fs.ts`, and (once fixed) the container. Neither `client/` nor `reviewer-core/`
references the exports feature. `vendor/shared` is the hand-synced surface mirrored into every
package, so a server-only port there widens that surface for nothing — the decoupling comes from
the interface plus the container, not the folder.

**Fix:** declare `ArchiveStore` in `server/src/adapters/archive/index.ts` beside `FsArchiveStore`,
exactly as `Tokenizer` (and this slice's own `Clock`) do; delete it from `vendor/shared/adapters.ts`.

### 2. Service constructs `FsArchiveStore` inline with `process.env` config (rules 3 & 6)

`server/src/modules/exports/service.ts:20-23` (concrete import at line 2)

The application layer imports the infrastructure concrete and `new`s it per request, reading
`ARCHIVE_DIR` and `EXPORT_SIGNING_SECRET` straight from `process.env` (with a hardcoded
`'dev-secret'` fallback). This is the textbook rules-3-and-6 violation: an infrastructure detail
and its configuration/secret hard-wired into the application ring, bypassing the composition root
and the `SecretsProvider`/config path. There is no `ContainerOverrides` slot for it, so tests
cannot swap in a mock archive — the swap-without-touching-the-core property is lost. The container
excerpt confirms the archive store is wired nowhere.

**Fix:** build the archive store once in `platform/container.ts` (root dir and signing secret from
`AppConfig` / `SecretsProvider`), add `archive?: ArchiveStore` to `ContainerOverrides`, and inject
the `ArchiveStore` port into `ExportsService` through its constructor alongside `clock`.

## Checked and acceptable (no findings)

- `adapters/clock/index.ts` — `Clock` is a server-local port correctly declared beside its
  adapter (`SystemClock`), the sanctioned Tokenizer pattern; injecting it into the service is fine.
- `adapters/archive/fs.ts` — adapter correctly `implements` the port; `node:fs`/`node:crypto`
  are allowed in infrastructure; dependency points inward at the interface.
- `modules/exports/routes.ts` — thin: validate params, `getContext`, call service, return the
  contract shape. No business logic, no DB, no adapter construction.
- `modules/exports/repository.ts` — concrete repository with Drizzle rows is sanctioned
  infrastructure (rule 7); no repository-interface ceremony needed for a single implementation.
- `modules/exports/helpers.ts` — row → DTO mapping at the boundary is exactly what `helpers.ts`
  is for; no raw rows escape to HTTP.
- `vendor/shared/contracts/export.ts` — Zod-only contract, imports nothing outer.
- `platform/container.ts` — the composition root may know every concrete; wiring `SystemClock`,
  providers, and overrides there is correct (it just needs to additionally own the archive store,
  per finding 2).

**Total: 2 findings.**
