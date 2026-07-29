# SPEC-91 Tag Search Endpoint (synthetic fixture — not a real DevDigest spec)

**Status:** approved

## Goals
Add a new backend endpoint `GET /tags/search?q=<term>` in `server/src/modules/tags/` that returns
tags whose name contains the search term (case-insensitive, prefix or substring match), for the
existing `tags` module (schema and repository already exist).

## Acceptance criteria (EARS)
- **AC-1**: WHEN a client calls `GET /tags/search?q=<term>` with a non-empty `q`, THEN the system
  SHALL return all tags in the caller's workspace whose name contains `q` (case-insensitive).
- **AC-2**: WHEN `q` is missing or empty, THEN the system SHALL respond `400 Bad Request`.

## Non-goals
- Pagination of results.
- Full-text ranking/relevance scoring.
