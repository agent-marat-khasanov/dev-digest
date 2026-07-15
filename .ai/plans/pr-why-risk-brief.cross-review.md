# Cross-model plan review — PR Why + Risk Brief plan

## Verdict
REQUEST CHANGES. The plan is close and the task/AC traceability is mostly credible, but there are a couple of spec-critical mismatches around **review_focus grounding** and the **hard “no diff/file content” input constraint** that could ship a passing-looking feature that violates SPEC-03. Fix those, plus tighten determinism for attached-spec ordering, and the rest looks implementable.

## Blocking issues

1. **AC-7 mismatch: `review_focus[].path` must be a *changed file*, not just any “real ref”**
   - **Where:** T4 (`buildRealRefSet`, `validateBrief`), also T7 rendering assumptions.
   - **Problem:** The plan validates `review_focus[].path` against a `realRefs` set that includes blast caller files and endpoints. That permits the model to return a downstream caller file that wasn’t changed, which violates **AC-7** (“each entry SHALL reference a real changed file present in the artifacts”).
   - **Concrete fix:**
     - In T4, compute **two** allowlists:
       - `changedFileSet`: from smart-diff file paths + `reviewRepo.getPrFiles` (normalize paths).
       - `riskRefSet`: the broader real-reference set for `risks[].file_refs` (blast files + caller files + endpoints + changed files).
     - Update `validateBrief`:
       - `review_focus = review_focus.filter(item => changedFileSet.has(item.path))` (drop otherwise).
       - `risks[].file_refs = file_refs.filter(ref => riskRefSet.has(ref))`.
     - Add unit tests in T8 that a model-emitted review_focus path that is a *caller* but not a changed file gets dropped.

2. **NG2 / AC-1 risk: Smart-diff artifact may contain diff-like content; plan doesn’t explicitly strip it**
   - **Where:** T4 (`gatherArtifacts` includes “smart-diff detail”), T9 (“assert no diff hunks/file bodies by inspecting the recorded prompt”).
   - **Problem:** The spec is a hard constraint: **no diff hunks, patches, or file contents** in the prompt (NG2 / AC-1). The plan assumes `SmartDiffService.getSmartDiff` is safe, but doesn’t require filtering to “groups & stats by role” only. If `SmartDiff` includes sample hunks/snippets today or in the future, this will violate the spec while still “using existing read paths.”
   - **Concrete fix:**
     - In T4, introduce a “prompt-safe smart diff view” mapping that includes only:
       - group/role name, file paths, and numeric stats (added/removed/changed counts) — **no snippets**.
     - In T9, assert absence of typical patch markers (`diff --git`, `@@`, lines starting with `+`/`-` in bulk) *and* assert the smart-diff block shape is stats-only (so tests don’t silently pass if content changes format).

3. **AC-2a determinism gap: attached-spec union ordering depends on agent listing order**
   - **Where:** T4 specs union algorithm (“for each agent … orderContextPaths … concatenate … dedupe by path (global Set, deterministic order)”).
   - **Problem:** Deterministic order is required (AC-2a). If `container.agentsRepo.list(ws)` is not guaranteed stable-ordered, then concatenation + first-seen dedupe is not deterministic.
   - **Concrete fix:**
     - Before iterating agents, sort agents deterministically (e.g., by `agent.id` or `agent.createdAt`, whichever is stable).
     - Better: collect the full union set of paths first, then apply one global deterministic sort (`orderContextPaths` if it can take a flat list; otherwise a stable lexical sort), then clone-read in that order.

4. **Endpoint vs file link handling is underspecified and likely wrong in the UI**
   - **Where:** T4 includes endpoints in `realRefs` and validates `risks[].file_refs` against it; T7 says “risks with links to referenced file”.
   - **Problem:** AC-6 allows endpoints as valid references, but AC-11 only promises links to referenced files for `review_focus` and doesn’t define endpoint linking behavior. If `file_refs` contains endpoints (e.g. `GET /v1/foo`), T7’s “file link” rendering may create broken or misleading links.
   - **Concrete fix:**
     - In T7 rendering, detect endpoint refs (e.g., starts with `GET ` / contains ` /` patterns used in blast) and render as **non-clickable badge/text**, while file paths become clickable.
     - Add RTL coverage in T10: endpoint ref is shown but not as an `<a href=...>` (or whatever link component is used).

## Non-blocking suggestions

1. **Avoid cross-module export of `extractLinkedIssueNumber` unless it’s already intended to be shared**
   - **Where:** T4 (“export `extractLinkedIssueNumber` from intent/service.ts”).
   - **Rationale:** This is minor surface-area increase in a core module; copying a 5-line regex is sometimes preferable under “don’t touch unrelated code.”
   - **Cost of ignoring:** Low, but it increases coupling and makes intent module API harder to keep stable.

2. **`generated_at` handling should be made explicit**
   - **Where:** T1 contract includes `generated_at`; T5 persistence description doesn’t mention setting it.
   - **Rationale:** Contract allows null, but UX/debuggability improves if it’s reliably set on each generation.
   - **Cost of ignoring:** Low; but you’ll likely get follow-up buglets (“why is generated_at always null?”).

3. **Rate-limit tests (T9) tend to be flaky; ensure harness uses deterministic clock/window**
   - **Where:** T9 AC-20.
   - **Rationale:** “10 per minute” can be nondeterministic under parallel test runs unless you isolate per-test server instance and avoid shared IP/user keys.
   - **Cost of ignoring:** Medium; CI flakes.

## AC coverage spot-check

- **AC-7 (weak/incorrect coverage):** Covered by T4/T7/T8 per the table, but T4’s current validation approach allows non-changed files (caller files) or even endpoints into `review_focus` because it validates against a broad `realRefs` set. Needs the blocking fix above.
- **AC-1 / NG2 (weak coverage):** Nominally covered by T4/T9, but unless T4 explicitly maps smart-diff to stats-only, the plan relies on current `SmartDiffService` behavior not to include snippet-like content. That’s a correctness risk against a hard constraint.
- **AC-2a (weak coverage):** Covered by T4/T9, but determinism is not actually guaranteed without sorting agents / globally ordering the union before dedupe+read.
- **AC-6/AC-11 interplay (potentially under-specified):** Plan includes endpoints in the real-reference set (good for AC-6), but UI task T7 describes “links to referenced file” for risks; without explicit endpoint handling, the implementation can easily violate the “not linked / not invented / not broken link” spirit of AC-6/AC-18.

If you address the 4 blocking items, the remaining plan structure (A/B/C/D sequencing, cache semantics, one-call structured generation, and security wrapping + output neutralization) looks on track.

---
*model: openai/gpt-5.2 · tokens in/out: 16592/3226 · finish: stop*
