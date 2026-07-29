# Architecture review — `exports` feature (port-placement fixture)

Standard applied: `.ai/skills/onion-architecture/` (SKILL.md + layers.md + dependency-rule.md +
ports-and-adapters.md + examples.md). Scope: layering, dependency direction, ports & adapters,
port placement, composition-root wiring only.

## Findings

### 1. `ArchiveStore` port is misplaced in `vendor/shared/adapters.ts`

`server/src/vendor/shared/adapters.ts:16-20`

`vendor/shared` is not "the place ports live" — it is the place packages *share*. The placement
question is: does any package outside `server/` have to name this type? For `ArchiveStore` the
answer is no — nothing under `client/` or `reviewer-core/` references the exports feature. Unlike
`LLMProvider`/`GitHubClient`/`SecretsProvider` (named by `reviewer-core`), this is a server-only
capability. Parking it in the hand-synced, client-mirrored `vendor/shared` widens the shared
surface and buys no decoupling — the decoupling comes from the interface plus the container, not
the folder.

**Fix:** declare `ArchiveStore` in `server/src/adapters/archive/index.ts` beside `FsArchiveStore`
(the `Tokenizer` precedent), and have `container.ts` import it from there.

### 2. `ExportsService` constructs the `FsArchiveStore` adapter itself

`server/src/modules/exports/service.ts:20-23` (import at line 2)

The application layer imports the concrete adapter and does
`new FsArchiveStore(process.env.ARCHIVE_DIR ?? …, process.env.EXPORT_SIGNING_SECRET ?? 'dev-secret')`
inline. This is the canonical rules 3 & 6 violation (examples.md, example 2):

- Infrastructure is wired into the application ring — the service should depend only on the
  `ArchiveStore` port, never on `FsArchiveStore`.
- The composition root is bypassed: the proposed `Container` has no `archive` member and
  `ContainerOverrides` has no `archive` slot, so tests cannot swap the filesystem store for a mock.
- Configuration and a signing secret are read from `process.env` inside a use case instead of
  flowing through `platform/config` / `SecretsProvider` at the root.

**Fix:** build `FsArchiveStore` once in `platform/container.ts` behind the `ArchiveStore` port
(config from `AppConfig`, secret via `SecretsProvider`), add `archive?: ArchiveStore` to
`ContainerOverrides`, and inject the port into `ExportsService` via its constructor — same pattern
already used for `clock`. The container wiring for `exportsService` (referenced by `routes.ts` but
absent from the excerpt) should assemble the full graph there: repository + clock + archive.

## Checked and found acceptable

- `Clock` / `SystemClock` (`adapters/clock/index.ts`) — correctly declared server-local port beside
  its adapter, wired in the container with an override slot, injected into the service. This is the
  pattern `ArchiveStore` should follow.
- `modules/exports/routes.ts` — thin: validate params, `getContext`, call service, return contract
  shape. No business logic, no infra reach-through.
- `modules/exports/repository.ts` — Drizzle confined to infrastructure; workspace-scoped query;
  `$inferSelect` rows as the module data model are allowed (rule 7); a concrete repository without
  an interface is allowed (rule 7).
- `modules/exports/helpers.ts` — boundary mapping (row → `ExportDto`) plus pure, I/O-free PDF
  assembly; no layering breach.
- `vendor/shared/contracts/export.ts` — Zod-only, imports nothing outward.
- `FsArchiveStore` itself — infrastructure implementing a port with `node:fs`/`node:crypto` is
  exactly where such code belongs; the problem is only who constructs it (finding 2) and where its
  port is declared (finding 1).

**Verdict:** two architecture violations, both centered on the new `ArchiveStore` capability —
its port is declared one ring too far in, and its adapter is constructed one ring too far out.
