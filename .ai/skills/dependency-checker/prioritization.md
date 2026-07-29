# Step 4 — Prioritize findings & recommend

Classify **every** finding into exactly one tier. Do not invent tiers. Order the report P0 → P1 →
P2 → Info.

| Tier | Criteria (examples) |
|---|---|
| **P0 — Fix soon** | A **circular** internal dependency; a package importing another package's `src/` **internals** by relative path instead of via its alias / public entry point; a dependency with a **known critical CVE** — flag CVEs **only** if you actually ran `pnpm audit` and can cite it. |
| **P1 — Should fix** | **Version drift** — the same npm package resolved to different major/minor across packages (e.g. `zod` differing between `server` and `client`); an **unused dependency** — declared in a `package.json` but never imported in that package's `src/` (grep-confirmed). |
| **P2 — Worth doing** | A **large** dependency (>5 MB) used by a **single** package where a lighter alternative exists; a **devDependency inconsistency** across packages (e.g. different `typescript` versions in `server/` vs `client/`); a heavy dep that could move from `dependencies` to `devDependencies`. |
| **Info** | Observations needing no action — a large but genuinely load-bearing dep (`next`), an intentional and documented coupling edge, `reviewer-core` staying lean. State why it's fine. |

## Recommendation discipline

- Every recommendation **names a specific** dependency, package, or file — never generic advice like
  "consider optimizing dependencies."
- Exactly **one** concrete next action per finding (e.g. "align `client` to `zod@3.23.x` to match
  `server`/`reviewer-core`, then re-run `pnpm install` in `client/`").
- A destructive or hard-to-reverse fix (removing a dep, force-resolving a version, deduping) is a
  **recommendation to confirm with the user** — this skill analyzes and reports, it never installs,
  removes, or updates a dependency itself.

## Repo-specific priors

- `zod` spans four packages — treat any version spread as **P1 drift** by default.
- `reviewer-core` must stay pure (`onion-architecture`): a **new runtime dependency** there — beyond
  `openai`/`zod` — is at least **P2**, and **P1** if it does I/O, since it erodes the core's purity.
- Client-internal aliases (`@/*`, `@messages/*`) crossing no package boundary are **not** findings.

## Summary block (report section 5)

Close with 3–5 bullets a developer can act on today, ordered by tier — the P0/P1 items first, each
one line: what to do and where. If there were no P0/P1 findings, say so plainly.
