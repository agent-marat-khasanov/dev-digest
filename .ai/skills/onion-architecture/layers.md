# Layers

The Onion model has concentric rings. The rule is constant: **inner rings know nothing about outer rings.** Below is each ring, its job, what it may import, and how it shows up in DevDigest's real code.

## Domain (the core)

**Job:** the shapes and the contracts the rest of the system orbits — request/response schemas, domain types, and the **ports** (interfaces) that name every capability the outside must provide.

**May import:** other domain code, Zod, plain TypeScript. Nothing else.

**Must NOT import:** Fastify, Drizzle, Octokit, `node:fs`, the `Container`, any `service.ts`/`routes.ts`/`repository.ts`.

In DevDigest:
- `server/src/vendor/shared/contracts/*` — Zod contracts (`findings.ts`, `review-api.ts`, …). Single source of truth for wire shapes.
- `server/src/vendor/shared/adapters.ts` — the **port interfaces**: `LLMProvider`, `Embedder`, `GitHubClient`, `GitClient`, `CodeIndex`, `SecretsProvider`. These are defined *inward* and implemented *outward* — that is the dependency inversion at the heart of Onion.

```ts
// vendor/shared/adapters.ts — a port lives in the core
export interface LLMProvider {
  readonly id: 'openai' | 'anthropic' | 'openrouter';
  listModels(): Promise<ModelInfo[]>;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
  embed(texts: string[]): Promise<number[][]>;
}
```

The core says *what* it needs (`LLMProvider`); it never says *which* vendor — that is decided on the outer ring.

## `reviewer-core` — the exemplar pure core

`reviewer-core/` is a whole package that lives at the center: **diff → prompt → LLM → grounded findings**, with zero I/O except an **injected** `LLMProvider`. No database, no filesystem, no GitHub, no Fastify. Its public API (`reviewer-core/src/index.ts`) exports pure functions — `assemblePrompt`, `groundFindings`, `reviewPullRequest`, `reduceReviews` — plus a shared `OpenRouterProvider`.

```ts
// server side injects the dependency; the core stays pure
const outcome = await reviewPullRequest({
  systemPrompt: agent.systemPrompt,
  diff,
  llm: await this.container.llm(agent.provider as Provider), // ← injected port
  // …
});
```

When you write new pure logic (scoring, grounding, prompt assembly), it belongs here — and it stays testable without a database or network. Treat `reviewer-core` as the reference for "what a pure core looks like."

## Application (use cases)

**Job:** orchestrate. Coordinate repositories and adapter ports to fulfill one request. This is where business decisions live.

**May import:** domain (contracts, ports), its own repository, the `Container` (to resolve ports). 

**Must NOT import:** Fastify request/reply types, route modules.

In DevDigest: `modules/<name>/service.ts` — e.g. `AgentsService`. It holds a repository and reaches adapters lazily through the container:

```ts
export class AgentsService {
  private repo: AgentsRepository;
  constructor(private container: Container) {
    this.repo = new AgentsRepository(container.db);
  }
  async listModels(provider: Provider): Promise<ModelInfo[]> {
    const llm = await this.container.llm(provider); // resolve a port
    return llm.listModels();
  }
}
```

Services take the `Container`, not a `FastifyRequest`. HTTP is a detail they never see.

## Infrastructure

**Job:** make the ports real. Talk to Postgres, OpenAI, GitHub, git, the filesystem.

**May import:** domain ports (to implement them), Drizzle, vendor SDKs.

**Two kinds in DevDigest:**
- **Repositories** — `modules/<name>/repository.ts`. Drizzle queries, always workspace-scoped. A row type (`AgentRow = typeof agents.$inferSelect`) is the module's data model — that's allowed (rule 7).
- **Adapters** — `adapters/<name>/*`. Each `implements` a core port: `OpenAIProvider implements LLMProvider`, `OctokitGitHubClient implements GitHubClient`, `SimpleGitClient implements GitClient`, `RipgrepCodeIndex implements CodeIndex`, `LocalSecretsProvider implements SecretsProvider`. Mocks in `adapters/mocks.ts` implement the same ports for tests.

Infrastructure depends inward (on the port) — never the reverse.

## Presentation (the edge)

**Job:** translate HTTP ↔ application. Validate the request with a Zod schema, read tenancy via `getContext`, call the service, return the value (Fastify + `fastify-type-provider-zod` serialize it through the response schema).

**May import:** everything inward (it's the outermost ring), plus Fastify.

**Must NOT contain:** business logic, direct DB access, direct adapter construction.

```ts
// modules/agents/routes.ts
const service = new AgentsService(app.container);
app.get('/agents/:id', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  const agent = await service.get(workspaceId, req.params.id);
  if (!agent) throw new NotFoundError('Agent not found');
  return agent;
});
```

## Composition root

`platform/container.ts` is the one place that knows every concrete class. The `Container` lazily builds adapters (`container.llm(id)`, `container.github()`, …) and exposes `db`. Tests pass `ContainerOverrides` to swap any port for a mock. This is the *only* layer allowed to wire concretes together — see [ports-and-adapters.md](ports-and-adapters.md).
