# SPEC-90 Webhook Delivery Retry (synthetic fixture — not a real DevDigest spec)

**Status:** approved

## Goals
Add a bounded retry to outbound webhook delivery in `server/src/modules/webhooks/`.

## Acceptance criteria (EARS)
- **AC-1**: WHEN a webhook POST fails with a 5xx or network error, THEN the system SHALL retry up
  to 3 times with exponential backoff (1s, 2s, 4s).
- **AC-2**: WHEN all retries are exhausted, THEN the system SHALL mark the delivery `failed` in the
  `webhook_deliveries` table and SHALL NOT retry further.
- **AC-3**: WHEN a webhook POST succeeds (2xx), THEN the system SHALL mark the delivery `delivered`
  and SHALL NOT retry.

## Non-goals
- Configurable retry counts/backoff (fixed values only, per AC-1).
- Retrying 4xx responses (client errors are not retried).
