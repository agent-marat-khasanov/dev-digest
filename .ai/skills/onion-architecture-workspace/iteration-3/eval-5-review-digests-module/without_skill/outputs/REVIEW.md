# Architecture Review — proposed `digests` module

Scope: layering, dependency direction, ports & adapters, composition-root wiring, boundary
mapping. Calibrated against the real codebase conventions (thin routes that delegate to a
service built from the container; all external I/O behind container-provided ports; secrets
via `SecretsProvider`; responses serialized against `vendor/shared` contracts).

## Findings (5)

### 1. Route bypasses the service and talks to infrastructure directly
`server/src/modules/digests/routes.ts:18-20`

The handler does `new DigestsRepository(container.db)` and runs the queries itself.
Presentation may depend only on the application layer; the repository is infrastructure.
`DigestsService.buildDigest` already exists and is simply never used.
**Fix:** construct `DigestsService` at plugin setup and delegate to it.

### 2. Business logic in the presentation layer
`server/src/modules/digests/routes.ts:22-35`

The severity/top-files aggregation is digest-assembly logic embedded in the route — and it
is a near-duplicate of `toDigestDto` in `helpers.ts`. Two divergent implementations of the
same business rule now live in two layers.
**Fix:** delete the in-route aggregation; the service/helper owns it.

### 3. Raw persistence rows leak across the HTTP boundary
`server/src/modules/digests/routes.ts:37-41`

The response body is `{ runs, findings, summary }` — raw Drizzle `$inferSelect` rows plus an
ad-hoc summary shape — while a shared `digestSchema` / `DigestDto` contract exists in
`server/src/vendor/shared/contracts/digest.ts` and is ignored. Clients get coupled directly
to the DB schema.
**Fix:** return the `DigestDto` and serialize with `digestSchema` as the route response schema.

### 4. Service performs direct external I/O instead of using a port
`server/src/modules/digests/service.ts:24-36` (const at line 6)

`DigestsService.sendDigest` calls `fetch()` against the Resend API directly. A concrete mail
vendor (URL, payload format, auth scheme) is hardwired into the application layer, violating
the dependency rule and making the service untestable without the network. Every other
external dependency in this server goes through a port implemented in `server/src/adapters/`
and wired in `platform/container.ts`.
**Fix:** define a `Mailer` port in `vendor/shared`, implement `ResendMailer` under
`server/src/adapters/`, wire it in the container, inject the port into the service.

### 5. Secret read from `process.env` inside the application layer
`server/src/modules/digests/service.ts:27`

`process.env.RESEND_API_KEY` bypasses the `SecretsProvider` port and the composition root.
In this codebase only the container/adapters resolve secrets (cf. `GITHUB_TOKEN`, LLM keys).
**Fix:** resolve the key via `SecretsProvider` when the container constructs the mail adapter.

## Not flagged (acceptable per project conventions)

- Module-local repository constructed inside the module (services/repos over `db`) — matches
  existing modules (`conventions`, `brief`).
- `helpers.ts` mapping Drizzle-inferred row types to the DTO — this is the boundary mapper;
  existing modules do the same (`toConventionDto`, `PrBriefRow`).
- `repository.ts` using Drizzle — repositories are infrastructure; that is their job.
- The `vendor/shared` Zod contract itself is correctly placed and dependency-free.
