# webhooks module INSIGHTS (synthetic fixture — not real DevDigest content)

## What Doesn't Work

- Do NOT call the delivery HTTP client directly from `service.ts` with a hardcoded timeout — the
  shared `httpClient` port (resolved from the Container) already enforces a 10s timeout and TLS
  pinning; a locally constructed client bypasses both and has caused hung requests in production.
- Do NOT store retry state in memory (a `Map` on the service instance) — the process restarts on
  every deploy and in-memory retry counters silently reset to 0, causing infinite retry loops after
  a redeploy. Retry count must live in the `webhook_deliveries` row.

## Recurring Errors & Fixes

- A retry loop that catches ALL errors (including validation errors on the payload itself) will
  retry a permanently-broken payload 3 times for nothing — only retry on 5xx/network errors, never
  on a 4xx.
