# SPEC-92 Comment Export (synthetic fixture — not a real DevDigest spec)

**Status:** approved

## Goals
Add an endpoint that exports all review comments for a given PR as a JSON array, for an existing
`comments` module (schema, repository, and service already exist).

## Acceptance criteria (EARS)
- **AC-1**: WHEN a client calls `GET /prs/:prId/comments/export`, THEN the system SHALL return every
  comment for that PR as a JSON array with fields `id`, `body`, `author`, `createdAt`.

## Non-goals
- CSV or any format other than JSON.
- Filtering by author or date range.

<!-- Deliberately silent on: what happens when the PR has zero comments, and what happens when
     :prId does not exist. A planner must surface these as open questions, not invent a rule. -->
