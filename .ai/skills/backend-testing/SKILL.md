---
name: backend-testing
description: "DevDigest backend testing expert (Vitest + Fastify + Drizzle + Postgres). ALWAYS invoke this skill when writing, reviewing, or setting up server-side or reviewer-core tests — unit (`*.test.ts`, hermetic, mock the outside world), integration (`*.it.test.ts`, real Postgres via testcontainers), Fastify route tests via `app.inject()`, and reviewer-core engine tests with a mocked LLM. Do not write backend tests directly — consult this skill first. Does NOT cover React/UI tests (use react-testing-library)."
---

# Backend Testing (DevDigest)

How to write meaningful Vitest tests for `server/` and `reviewer-core/`. Grounded in `TESTING.md`,
`server/test/helpers/pg.ts`, and `server/src/adapters/mocks.ts`. Companion to the UI-side
`react-testing-library` skill.

## Philosophy (from TESTING.md)

- **Test behaviour at the seams**, not implementation details — routes, adapters, contracts, the
  review pipeline. Not line coverage.
- **Mock only the outside world** (LLM, GitHub, git, network, clock/fs) — never the code under test or
  same-module domain logic. Hermetic unit tests use `server/src/adapters/mocks.ts`.
- **One real integration per data-backed workflow**, against a real Postgres (not a mock DB) — the
  bugs there live in SQL, migrations, and wiring.
- A new test must be able to **fail**: assert the *specified* behaviour, not whatever the code
  currently returns. No tautological tests.

## Test kinds & file conventions

| Kind | File suffix | DB? | Runner notes |
|------|-------------|-----|--------------|
| Unit (hermetic, the majority) | `*.test.ts` | no | excluded set is `**/*.it.test.ts` |
| Integration | `*.it.test.ts` | **real Postgres (testcontainers)** | needs Docker |
| reviewer-core engine | `*.test.ts` | no | pure; mock the LLM, no DB/GitHub/FS |

Commands: `pnpm test` (all), `pnpm exec vitest run --exclude "**/*.it.test.ts"` (unit only, no Docker).

## Unit tests (hermetic)

- Reach the outside world through the container's ports and substitute the mocks in
  `server/src/adapters/mocks.ts` (LLM/GitHub/git) so tests are key-free and deterministic.
- Assert on observable outcomes: returned value, HTTP status + body, or computed result — not the
  call graph. `expect(fn).toHaveBeenCalledWith(...)` is not a primary assertion.

## Fastify route tests

- Use **`app.inject({ method, url, payload })`** — no real socket. Assert on `res.statusCode` and
  `res.json()`.
- Build the app via the project's app factory with a test container (mocks wired). A
  response-schema mismatch surfaces as **500** (fastify-type-provider-zod), so assert the exact body
  shape the contract promises.

## Integration tests (`*.it.test.ts`, real Postgres)

- Spin up Postgres with **`startPg()`** from `server/test/helpers/pg.ts`; **gate on Docker** so the
  suite skips cleanly without it:

  ```ts
  import { startPg, dockerAvailable } from "../test/helpers/pg.js";
  const describeIt = (await dockerAvailable()) ? describe : describe.skip;
  describeIt("intent integration", () => {
    let pg: Awaited<ReturnType<typeof startPg>>;
    let app: Awaited<ReturnType<typeof buildApp>>;
    beforeAll(async () => { pg = await startPg(); app = await buildApp({ db: pg.db }); });
    afterAll(async () => { await app.close(); await pg.stop(); });
    // ...inject requests, assert DB state
  });
  ```

- **Always tear down** (`pg.stop()`, `app.close()`) in `afterAll`. Testcontainers is slow on first
  run (pulls the image), fast after.
- Verify real DB state for data-backed flows (the value of an integration test is catching SQL /
  migration / wiring bugs a mock would hide).

## reviewer-core engine tests

- Pure engine: inject a **mock `LLMProvider`** (a stub `completeStructured`) — never a real key, no
  DB/GitHub/FS. Test prompt assembly, grounding, reduce/score, and degradation paths deterministically.

## What to test

- Map **each requirement / acceptance criterion** to ≥1 behaviour test: a happy path + the edge that
  actually matters. Use-case coverage beats line coverage.

## Forbidden (test smells)

- **Over-mocking** — mocking the code under test or same-module domain logic.
- **Asserting on mocks** as the main assertion (test the outcome, not the call graph).
- **Snapshot spam**, **testing the framework** ("returns 200 and nothing else"), brittle internals.
