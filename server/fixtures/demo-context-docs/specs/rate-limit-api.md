# Rate Limiting Spec

Public API endpoints must be protected by a token-bucket rate limiter to
prevent abuse from unauthenticated clients.

## Requirements

- Default bucket: 60 requests / minute per IP.
- Exceeding the bucket returns `429 Too Many Requests` with a `Retry-After` header.
- The limiter must not add more than 5ms of latency per request.
