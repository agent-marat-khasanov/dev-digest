# Step 1 — Discover dependencies

Two independent passes. Keep their outputs separate — they feed different parts of the report.

## External (npm) — per package

For each `package.json` in scope, read `dependencies` and `devDependencies`. Record name, version
range, and which package declared it.

```bash
# one package's declared deps, split runtime vs dev
node -e 'const p=require("./server/package.json");console.log("deps",JSON.stringify(p.dependencies,null,0));console.log("dev",JSON.stringify(p.devDependencies,null,0))'
```

- **Version drift** — the same package resolved to **different major/minor** across packages. `zod`
  is the one to watch: it is declared in `server`, `client`, `reviewer-core`, and `mcp`. Compare the
  declared ranges *and* the resolved versions in each `pnpm-lock.yaml`.
- **Unused dependency** — declared in a `package.json` but never imported in that package's `src/`.
  Confirm with a grep before flagging (a dep used only in a config file or a script still counts):

  ```bash
  # is `moment` actually imported anywhere under server/src ?
  grep -rInE "from ['\"]moment['\"]|require\(['\"]moment['\"]\)" server/src || echo "not imported in server/src"
  ```

- **Tooling devDeps** (`vitest`, `typescript`, `tsx`, `eslint`, `prettier`, `@types/*`) are **not**
  architectural dependencies — keep them out of the graph. They still count for size and for the
  "devDependency inconsistency across packages" finding (e.g. different `typescript` versions).

## Internal (cross-package) — per package

Internal deps are **path aliases and boundary-crossing relative imports**, never `workspace:*`.

1. Read each package's `tsconfig.json` `paths` to learn its aliases:

   ```bash
   for tc in server client reviewer-core mcp e2e evals; do echo "--- $tc ---"; sed -n '/"paths"/,/}/p' "$tc/tsconfig.json" 2>/dev/null; done
   ```

   Known cross-package aliases: `@devdigest/shared` (server, client, reviewer-core, mcp),
   `@devdigest/reviewer-core` (server). Client-internal only: `@devdigest/ui`, `@/*`, `@messages/*`.

2. Grep each package's `src/` for imports that cross a package boundary — an alias above, or a
   relative path that escapes the package (`../../reviewer-core/…`, `../../server/…`):

   ```bash
   grep -rInE "from ['\"](@devdigest/(shared|reviewer-core|ui)|\.\./\.\./(server|reviewer-core|client))" server/src client/src reviewer-core/src mcp/src
   ```

   Record each edge as **importer → imported**, and count occurrences to gauge coupling strength.
   Flag any package importing another package's `src/` **internals** by relative path instead of
   through its alias / public entry point — that is a P0 (see [prioritization.md](prioritization.md)).

## Optional: precise internal graph via dependency-cruiser

`server/` already ships `dependency-cruiser` and `@ast-grep/napi`. For a rigorous internal import
graph (and machine-detected cycles) you may run:

```bash
cd server && npx depcruise --include-only "^src" --output-type dot src | head -50
```

Use it to *confirm* edges and catch circular dependencies; still summarize the result in the report
yourself. If it is not set up, fall back to the grep pass above — don't block on it.
