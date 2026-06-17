# @devdigest/e2e — End-to-End Tests

Deterministic browser flows using agent-browser (Rust CLI, Chrome CDP). No LLM, no API keys required.

## Commands

```sh
pnpm test                    # tsx run.ts (run all specs)
pnpm e2e:hermetic            # ../scripts/e2e.sh (isolated Postgres, seeded, full run)
pnpm typecheck               # tsc --noEmit
```

## Architecture

- **Runner:** `run.ts` — CLI orchestrator for agent-browser specs
- **Specs:** `specs/*.flow.json` — declarative flow files (open, wait, find, assert)
- **Assertions:** `lib/assert.ts` — custom assertion helpers

## Conventions

- All flows are **deterministic** — use `--url`, `--text`, `--selector`, never AI `chat` command
- Flows run against **seeded data** (acme/payments-api repo, PR #482, default agents)
- Spec files are numbered for execution order (01 -> 07)
- Hermetic mode: isolated Postgres -> fresh migrations -> seed -> specs -> teardown

## Spec Coverage

| Spec | Covers |
|------|--------|
| 01-app-boot | Root redirect -> PR list |
| 02-repo-pulls-detail | PR list -> PR detail |
| 03-agents | Agent list rendering |
| 04-pr-findings | Run findings tab |
| 05-pr-diff | Diff viewer |
| 06-onboarding | Add-repo form |
| 07-settings | Settings pages |

## Read When

- `README.md` — flow format, spec conventions, hermetic runner
- `specs/` — actual flow definitions
- `INSIGHTS.md` — module-specific gotchas and non-obvious behavior
- `docs/` — e2e-specific documentation
