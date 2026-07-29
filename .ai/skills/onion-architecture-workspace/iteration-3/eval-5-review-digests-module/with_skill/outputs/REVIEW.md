# Architecture review — proposed `digests` module

Standard applied: `.ai/skills/onion-architecture` (SKILL.md + layers.md + dependency-rule.md +
ports-and-adapters.md + examples.md). Scope: layering, dependency direction, ports & adapters,
composition-root wiring, boundary mapping only.

## Verdict

The infrastructure and domain edges of the slice are correct — `repository.ts` (Drizzle,
workspace-scoped), `helpers.ts` (row → DTO mapping), and `contracts/digest.ts` (pure Zod) are all in
the right layer with correct import direction. The violations are concentrated in `routes.ts`
(which ignores the application layer it sits on top of) and `service.ts` (which hard-wires an
external vendor into the application ring).

## Findings

### 1. Route bypasses the application layer (routes.ts:18-20)

The handler does `new DigestsRepository(container.db)` and queries it directly. Presentation must
call the service, not construct or touch infrastructure (SKILL rules 4 & 6). Ironically
`DigestsService.buildDigest` already exists and does exactly this work — it is simply never used by
the route.

**Fix:** build `DigestsService` once in `digestRoutes` from `app.container` and call
`service.buildDigest(...)` in the handler.

### 2. Business logic in the route (routes.ts:22-35)

Severity aggregation and top-file ranking are computed inline in the HTTP handler — a duplicate of
`toDigestDto` in `helpers.ts`. Routes validate, read context, call the service, return (rule 4).

**Fix:** delete the inline aggregation; the service already returns the mapped DTO.

### 3. Raw Drizzle rows leak to HTTP (routes.ts:37-41)

The response is `{ runs, findings, summary }` — raw `$inferSelect` rows (internal columns such as
`workspaceId` included) in an ad-hoc shape. The wire shape must be the Zod contract
(`digestSchema`), mapped in `helpers.ts` (rule 5). The contract exists and is bypassed.

**Fix:** return the `DigestDto` from the service and declare `digestSchema` as the response schema.

### 4. Mail sending is not behind a port (service.ts:24-36)

`sendDigest` calls the Resend HTTP API with a raw `fetch` and reads
`process.env.RESEND_API_KEY` directly. This wires a vendor into the application ring, bypasses the
`SecretsProvider` port for the key, and cannot be swapped/mocked via `ContainerOverrides`
(rules 3 & 6). Cross-process I/O (mail is exactly that) is required to go through a
container-resolved port.

**Fix:** server-local `Mailer` port declared beside its adapter in `adapters/mailer/index.ts`
(no outside package needs the type, so not `vendor/shared/adapters.ts`), adapter gets the key via
the container's secrets provider, wired in `platform/container.ts` with an override slot; the
service resolves it from the container.

### 5. Service constructed on `Db` instead of the `Container` (service.ts:11-13)

The application layer may import domain, its own repository, and the `Container` — not
`db/client` (dependency-rule table). Taking the raw `Db` handle couples the service to
infrastructure and leaves it with no way to resolve ports (which `sendDigest` needs).

**Fix:** `constructor(private container: Container)` and build the repository from
`container.db`, matching `AgentsService`.

## Explicitly not flagged

- Concrete `DigestsRepository` with no interface — sanctioned (rule 7: *twice, tolerate; thrice,
  extract*).
- `$inferSelect` row types as the module's data model — sanctioned (rule 7).
- `helpers.ts` importing row types from `repository.ts` — that is the intended boundary-mapping
  seam.
- Non-architecture note (out of scope for findings): `renderDigestHtml` interpolates file paths
  into HTML unescaped; worth a look under the `security` skill once the mailer moves behind its
  adapter.
