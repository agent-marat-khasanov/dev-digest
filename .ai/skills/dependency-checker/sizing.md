# Step 3 — Size breakdown

Report the **installed** size of the heaviest **direct** dependencies, per package, then a
repo-wide total. Measure — never estimate.

## Measure

```bash
# heaviest direct deps of one package, sorted
du -sh server/node_modules/* 2>/dev/null | sort -rh | head -15

# one dependency
du -sh client/node_modules/next 2>/dev/null

# whole-package footprint
du -sh server/node_modules client/node_modules reviewer-core/node_modules mcp/node_modules 2>/dev/null
```

If a package has **no `node_modules`** (in this repo, `e2e/` typically doesn't), report
`not installed — run pnpm install to size` for that package. Do **not** guess its size, and do not
skip it silently — name it in Scope as skipped.

## Per-package table (one per package, sorted descending)

| Dependency | Version | Installed size | Used by (files) | devDependency? |
|---|---|---|---|---|
| `next` | 15.x | 132M | `client/src/app/**/*.tsx` | no |
| `mermaid` | … | … | `client/src/**` (diagram render) | no |

- `Used by` should point at real import sites (from the Step-1 grep), not a guess.
- Keep runtime deps and devDeps distinguishable (the last column), since a heavy devDep matters less
  than a heavy runtime dep shipped to users.

## Repo-wide roll-up

- Total `node_modules` size per package, and the grand total.
- The **single largest dependency** across the whole repo — call it out by name, package, and size.

Grounding for this repo (verify live, these drift): `client/` is by far the heaviest footprint,
`reviewer-core/` should be the leanest (it declares only `openai` + `zod`). A `reviewer-core/`
footprint that grows unexpectedly is itself worth a finding — cross-reference the purity rule in
`onion-architecture`.
