# API Team Notes

## What Doesn't Work

- A fixed per-minute counter caused thundering-herd retries at the minute
  boundary — switched to a token bucket instead.

## Recurring Errors & Fixes

- Forgetting the `Retry-After` header makes clients hammer the endpoint —
  always set it on a 429.
