# Payments API Architecture

The service is a Fastify API backed by Postgres. Public endpoints sit behind
the rate-limiting middleware described in the rate-limit spec.

## Layers

- Routes → Services → Repositories, in that order.
- No route talks to the database directly.
