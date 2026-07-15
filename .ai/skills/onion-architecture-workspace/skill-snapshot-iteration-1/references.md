# References & Rationale

External sources behind this skill's rules. The DevDigest rules in [SKILL.md](SKILL.md) are the canon; these explain *why* and provide deeper reading.

## Internal sources (read these first)

- `server/CLAUDE.md` / `server/README.md` — module map, DI flow, route table; the request lifecycle this skill layers onto.
- `server/INSIGHTS.md` — module-specific gotchas (workspace scoping, manual migrations, run reaping).
- `server/src/platform/container.ts` — the composition root in the flesh.
- `server/src/vendor/shared/adapters.ts` — every port interface.
- `reviewer-core/README.md` — the pure-core pipeline (diff → prompt → grounding → findings).
- `CLAUDE.md` / `AGENTS.md` — coding rules (no premature abstraction, no over-scoping) — they justify rule 7's pragmatism.
- Sibling skills — `fastify-best-practices` (route/plugin mechanics), `drizzle-orm-patterns` (query syntax), `zod` (schema authoring), `postgresql-table-design`. This skill is **layering/dependencies**; defer mechanics to those.

## A. Onion Architecture — the source

- [Jeffrey Palermo — The Onion Architecture, Part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) — the original article that coined it; the dependency rule and domain-at-center.
- [NDepend — Onion Architecture: Going Beyond Layers](https://blog.ndepend.com/onion-architecture-layers/) — how dependencies flow between rings and why it scales with domain complexity.
- [Bitloops — Onion Architecture: Concentric Layers Without Compromise](https://bitloops.com/resources/software-architecture/onion-architecture) — layer responsibilities, enforcement rules, anti-patterns; emphasis on domain purity.

## B. How it relates to Hexagonal / Clean / DDD

- [Eric Damtoft — Onion vs Clean vs Hexagonal Architecture](https://medium.com/@edamtoft/onion-vs-clean-vs-hexagonal-architecture-9ad94a27da91) — clears up what's the same (dependency inversion) and what differs.
- [Herberto Graça — Explicit Architecture (DDD, Hexagonal, Onion, Clean, CQRS)](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/) — how the families fit together in practice; ports & adapters framing.

## C. Onion in Node.js / TypeScript

- [Remo Jansen — Implementing SOLID and Onion Architecture in Node.js with TypeScript and InversifyJS](https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad) — concrete TS layering & DI (we use a hand-rolled container instead of Inversify).
- [Sankhadip Samanta — Onion Architecture in Node.js with TypeScript](https://sankhadip.medium.com/onion-architecture-in-node-js-with-typescript-5508612a4391) — folder structure and layer responsibilities for a Node service.
- [Vimulatus — Repository Pattern in Nest.js with Drizzle ORM](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae) — repositories as adapters over Drizzle; informs rule 7 (concrete repos are fine; extract a port when a second impl appears).
