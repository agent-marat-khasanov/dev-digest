# Specs (cross-module)

Spec-Driven Development specifications for features that span **more than one module**
(e.g. client + server). Single-module specs live in that module's own folder:
`server/specs/`, `client/specs/`, `reviewer-core/specs/`.

> `e2e/specs/` is a different artifact — deterministic browser-flow JSON, not SDD specs.

## Convention

- Files are named `SPEC-NN-<kebab-slug>-<YYYY-MM-DD>.md` — ID, feature name, creation date;
  `NN` is **global across all specs folders** (next spec = highest existing number anywhere + 1).
  The date is the creation date and never changes on later edits.
- Header line: `# Spec: <feature> | Spec ID: SPEC-NN | Status: draft|approved|implemented`.
- Acceptance criteria use **EARS** syntax, each with an `AC-n` ID — downstream plans and
  verification reference these IDs.
- Specs may include Mermaid workflow / module-communication diagrams and boundary-level contracts
  (field tables, error codes) — never implementation details (code, function-level design).
- Specs are produced and maintained by the **`spec-creator`** agent (`.ai/agents/spec-creator.md`),
  which may write only inside specs folders. New specs start as `draft`; status changes and
  `Supersedes` links happen only on explicit instruction.

## Spec index

All specs across the repo, maintained by `spec-creator` on every creation and status change.

| Spec ID | Title | Location | Status |
|---------|-------|----------|--------|
| SPEC-01 | Project Context | `specs/SPEC-01-project-context-2026-07-12.md` | approved |
| SPEC-02 | Onboarding Generator | `specs/SPEC-02-onboarding-generator-2026-07-12.md` | approved |
| SPEC-03 | PR Why + Risk Brief | `specs/SPEC-03-pr-why-risk-brief-2026-07-13.md` | approved |
| SPEC-04 | Eval Pipeline | `specs/eval-pipeline.md` | approved |
