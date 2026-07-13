# Cross-model plan review — Onboarding Generator

## Verdict
REQUEST CHANGES. The plan is close, but it has a couple of spec/contract mismatches that will either (a) fail acceptance criteria outright (especially AC-21/AC-7), or (b) create ambiguous behavior that tests could pass while the implementation is wrong (AC-8, AC-4). Fixing these now is cheaper than unwinding a UI/API contract later.

## Blocking issues

1. **API route/repo-resolution mismatch vs spec contract**
   - **Concern:** **API contracts section** + **T5** define `GET /repos/:id/tour` and `POST /repos/:id/tour/regenerate`, but SPEC-02 explicitly states: “**Server endpoints** (repo resolved from workspace context, workspace-scoped)” and the flow shows `GET /tour` / `POST regenerate` (repo from active-repo context like `/context`).
   - **Why this blows up:** if the UI is repo-context-scoped and the server is also supposed to be repo-context-scoped, adding `:id` can be an authorization/tenancy footgun and diverges from the “active repo” routing model called out in the spec. It also affects AC-22 verification scope (workspace scoping) because now you have *both* context and explicit params.
   - **Concrete fix:** decide and align everywhere:
     - If spec is the source of truth (it is): change **T5** routes to `/tour` + `/tour/regenerate` (repo resolved from active repo context on the server, analogous to whatever `/context` does), and update **T8** to call those endpoints (no `repoId` in URL).
     - If the existing backend convention truly requires `/repos/:id/...`, then the plan must explicitly justify that SPEC-02’s “repo resolved from workspace context” is satisfied by server-side workspace scoping **plus** explicit repo param—and update the spec (not allowed at implementation time). As-is, this is a mismatch.

2. **AC-21 is not actually satisfied: markdown links in `body` can bypass validation**
   - **Concern:** **T9** proposes rendering `section.body` with `react-markdown` and relying on “no `rehype-raw`” for safety. That prevents raw HTML, but **does not** prevent `<a href="...">` being created from markdown link syntax, nor does it ensure `href` is validated per **AC-7**/**AC-21**.
   - **Why this fails AC-21:** AC-21 requires “any link target validated per AC-7 — no model-emitted string reaches the DOM as … an unvalidated `href`/`src`.” The plan only validates the structured `links[]` in **T4 validate.ts**, not links embedded in markdown `body`.
   - **Concrete fix:** in **T9** (and/or **T4**), enforce one of:
     - **Option A (simplest):** strip/disable markdown links entirely in `body` by overriding the markdown `a` renderer to render plaintext (or a `<span>`) and only allow navigation via validated `links[]` chips.
     - **Option B:** implement a link sanitizer/validator for markdown-rendered anchors that only allows internal “open file” targets that are present in the gathered facts (same allowlist used by **T4 validate.ts**). Everything else renders as non-clickable text.
     - Add an explicit RTL test in **T12** that a model body containing `[x](javascript:alert(1))` and `[x](https://evil)` does not produce a clickable link.

3. **AC-7 is under-covered: reading-path/critical-path file paths may not be validate-able if they’re in markdown**
   - **Concern:** The plan’s **T4 validate.ts** is described as `(sections, allowedPaths) → sections with unknown-path links dropped`, which only works if *all* file paths the model emits appear in structured fields (`links[].path`, etc.). But the plan doesn’t explicitly constrain the model schema/output so reading-path entries and critical-path targets are guaranteed to be in `links[]` (vs written inline in markdown).
   - **Why this fails AC-7:** AC-7 explicitly includes “reading-path entries / critical-path Open targets”. If those are authored in `body`, you can’t reliably validate/drop them without parsing natural language.
   - **Concrete fix:** tighten the structured output:
     - Update the structured schema used in **T5** `completeStructured` so each section has explicit structured items for anything that must be clickable/validated, e.g.:
       - `critical_paths.items: { path, role }[]`
       - `reading_path.items: { path, why }[]`
       - keep `run_locally.commands: string[]`
     - Then render the clickable “Open” targets and numbered reading list from these structured arrays only.
     - If you keep the generic `links[]`, then at minimum explicitly specify in **T3** prompt + schema that *reading_path entries and critical_paths entries must be emitted as `links[]` only*, and add unit tests (**T10**) asserting the validator drops unknown paths and that the UI uses only `links[]` for clickables.

4. **AC-8 risk: “How to run locally” commands must be fact-derived, but plan allows model to author them**
   - **Concern:** The contract/schema in the plan includes `TourSection.commands` and implies the model might populate it (“model’s narrative (… run commands …) is rendered” in AC-21; plan doesn’t state commands are overridden by facts).
   - **Why this can violate AC-8:** AC-8 requires commands “derived from the repo’s real scripts/setup facts” and “copy-only”. If the model is allowed to generate commands, you can’t guarantee they are derived from scripts/setup facts, even if you *also* included those facts in the prompt.
   - **Concrete fix:** make commands **deterministic**:
     - In **T4 facts.ts**, extract run commands deterministically from repoIntel-provided scripts/setup facts (wherever that lives: likely `getRepoMap` or whatever repoIntel exposes for scripts—be explicit).
     - In **T5**, set `run_locally.commands = extractedCommands` regardless of model output (or exclude `commands` from the model schema entirely).
     - The model can still write narrative in `run_locally.body` that references the commands, but cannot invent them.
     - Add an integration test in **T11** that even if the LLM returns a different `commands`, the response uses the fact-derived set.

5. **AC-4 “Open target points at a real indexed file path” is not concretely planned on the client**
   - **Concern:** **T9** says “file-path chips” and “Open links” but doesn’t specify what route/component is used to open a file and how it’s guaranteed to be “real indexed”.
   - **Why this is risky:** you can satisfy AC-7 by dropping unknown paths, yet still fail AC-4 if the “open” UI doesn’t actually navigate to a real file viewer for that workspace/repo (or uses an incorrect path format).
   - **Concrete fix:** in **T9**, explicitly state:
     - what the “Open” target URL is (existing file viewer route), and
     - that the UI only renders “Open” using validated structured paths (from **T4 validate.ts**), not by interpolating markdown.
     - Add an integration test in **T11** asserting that returned critical-path links are a subset of `allowedPaths` and match the indexed path format expected by the file viewer.

## Non-blocking suggestions

1. **Avoid over-modularizing server onboarding into 5+ helper files unless there’s a proven need**
   - **Where:** **T4** (`facts.ts`, `skeleton.ts`, `validate.ts`, `prompt.ts`, `constants.ts`)
   - **Rationale:** spec rule is “simplest thing that works”; this helper explosion can increase coupling and make it harder to follow the single-call + fallback flow.
   - **Cost of ignoring:** higher review/maintenance overhead; more surface area for subtle contract drift between helpers.

2. **Add stampede protection for cache misses (optional but pragmatic)**
   - **Where:** **T5** (`getTour` cache miss → `generateAndStore`)
   - **Rationale:** Two simultaneous page loads on a cold cache can trigger two model calls for the same SHA. Spec doesn’t forbid, but cost visibility (G6) plus “one call per SHA” intent implies it’s undesirable.
   - **Cost of ignoring:** occasional duplicated LLM spend and inconsistent “last refreshed” timestamps.

3. **Risk 2 (“activeKeyFor” mapping `/onboarding` → onboarding-tour) should be resolved now**
   - **Where:** **Risks/open questions #2**, **T7**
   - **Rationale:** leaving it knowingly wrong means the nav highlight will be incorrect on the Add Repository page; that’s user-visible regression.
   - **Cost of ignoring:** UI bug that will get reported and then “fixed later” by touching out-of-scope code anyway. If it’s truly pre-existing, a minimal fix is still low-risk.

## AC coverage spot-check

- **AC-21** — **Weakly covered** by **T9/T12** as written. Rendering markdown without raw HTML is not enough; markdown links still create unvalidated `href`. Needs explicit sanitization or link rendering override (see Blocking #2).
- **AC-7** — **Weakly covered** by **T4/T10** if the implementation allows file paths inside markdown `body`. Validation must apply to *all* model-emitted paths that can become click targets, which implies structured outputs for reading-path / critical-path items or strict rules that only `links[]` are used (see Blocking #3).
- **AC-8** — **Under-covered** by **T4/T5/T11** because the plan does not explicitly prevent the model from inventing run commands. Must be deterministically derived from repo scripts/setup facts (see Blocking #4).
- **AC-4** — **Nominally covered** by **T4/T5/T9/T11**, but the plan doesn’t specify the client “Open” behavior/route and doesn’t guarantee the clickable targets originate solely from validated structured data (see Blocking #5).
- **AC-1** — **Potentially under-covered** in **T4/T11**: plan references `getReachableFacts(topFiles, 2)` for “routes & scripts”, but SPEC-02 requires routes **and scripts** as factual inputs. The plan should explicitly list which repoIntel method yields “scripts/setup facts” used for AC-8 and prove no additional fact gathering occurs.

---
*model: openai/gpt-5.2-20251211 · tokens in/out: 13925/5468 · finish: stop*
