# Examples — good vs bad

Concrete violations and their fixes, using real modules (`agents`, `reviews`). Each maps to a hard rule in [SKILL.md](SKILL.md).

## 1. Business logic in the route (rule 4)

A route should validate, get context, call the service, return. Logic belongs in the service.

```ts
// ❌ BAD — orchestration and rules leak into presentation
app.post('/agents', { schema: { body: CreateAgentBody } }, async (req, reply) => {
  const { workspaceId } = await getContext(app.container, req);
  if (req.body.provider === 'openai' && !req.body.model.startsWith('gpt-')) {
    throw new ValidationError('bad model');          // business rule in a route
  }
  const row = await app.container.agentsRepo.insert({ // route reaching into infra
    workspaceId, ...req.body, version: 1,
  });
  reply.status(201);
  return toAgentDto(row);                             // mapping in a route
});
```

```ts
// ✅ GOOD — thin route, logic in the service
app.post('/agents', { schema: { body: CreateAgentBody } }, async (req, reply) => {
  const { workspaceId, userId } = await getContext(app.container, req);
  const agent = await service.create(workspaceId, req.body, userId);
  reply.status(201);
  return agent;
});
```

The validation rule, the insert, and the DTO mapping all move into `AgentsService.create` / `helpers.ts`.

## 2. Constructing an SDK inside a service (rules 3 & 6)

```ts
// ❌ BAD — vendor wired into the application ring; key leaked; unmockable
import OpenAI from 'openai';
export class AgentsService {
  async listModels(provider: Provider) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return client.models.list();
  }
}
```

```ts
// ✅ GOOD — resolve the port through the container
export class AgentsService {
  constructor(private container: Container) {
    this.repo = new AgentsRepository(container.db);
  }
  async listModels(provider: Provider): Promise<ModelInfo[]> {
    const llm = await this.container.llm(provider); // LLMProvider port
    return llm.listModels();
  }
}
```

Now a test injects `MockLLMProvider` via `ContainerOverrides.llm` and the service is unchanged.

## 3. Returning a raw Drizzle row (rule 5)

The wire shape is the Zod contract, not the table shape (camelCase columns, internal fields).

```ts
// ❌ BAD — DB row escapes straight to HTTP
app.get('/agents/:id', async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  return service.repo.getById(workspaceId, req.params.id); // startLine, workspaceId, … leak
});
```

```ts
// ✅ GOOD — map at the boundary in helpers.ts
export function toAgentDto(row: AgentRow): Agent {
  return { id: row.id, name: row.name, provider: row.provider, model: row.model /* … */ };
}
// service returns the DTO; the route returns the service result
```

`helpers.ts` is the anti-corruption seam between infrastructure (rows) and presentation (contracts).

## 4. ORM / framework leaking into the core (rules 1 & 2)

```ts
// ❌ BAD — reviewer-core importing infrastructure
import { db } from '../../server/src/db/client';
export async function reviewPullRequest(opts) {
  const agent = await db.query.agents.findFirst(/* … */); // core now needs a database
  // …
}
```

```ts
// ✅ GOOD — the core receives what it needs; the server does the I/O
export async function reviewPullRequest(opts: {
  systemPrompt: string; diff: string; llm: LLMProvider; /* … */
}) { /* pure: diff → prompt → grounded findings */ }

// server/src/modules/reviews/run-executor.ts wires it:
const outcome = await reviewPullRequest({
  systemPrompt: agent.systemPrompt,
  diff,
  llm: await this.container.llm(agent.provider as Provider),
});
```

`reviewer-core` stays testable with no database and no network — the server is the only thing that touches Postgres, git, and secrets.

## 5. Where a new piece goes — quick reads

- "Add a 'duplicate finding' suppression rule" → pure logic → `reviewer-core` (or a service if it needs repo data). Not the route.
- "Call a new Jira API" → port in `vendor/shared/adapters.ts` + adapter in `adapters/jira/` + container wiring. Not a `fetch()` in a service.
- "New endpoint to list runs" → `routes.ts` (thin) → `service.ts` (orchestrate) → `repository.ts` (query) → `helpers.ts` (map). One slice, three rings.
