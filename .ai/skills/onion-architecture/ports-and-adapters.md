# Ports & Adapters

Onion's outer ring is "details": databases, APIs, SDKs. We keep them swappable with two pieces — a **port** (an interface in the core) and an **adapter** (an implementation on the outside) — wired together in one **composition root**.

## Port: the interface in the core

A port names a capability the inside needs, in the inside's own terms. It mentions no vendor: the core
depends on `LLMProvider`, never on `openai`.

**Where the interface is declared depends on who has to name it.**

`server/src/vendor/shared/adapters.ts` — for ports that cross a package boundary:

`LLMProvider`, `Embedder`, `GitHubClient`, `GitClient`, `CodeIndex`, `SecretsProvider`.

These are there because `reviewer-core` names them too (`reviewer-core/src/review/run.ts` takes an
`LLMProvider`), and `vendor/shared` is the one dependency-free module both packages can import.

`adapters/<name>/index.ts` — for a **server-local port**, declared next to its implementation:

| Port | Declared in | Named by |
|---|---|---|
| `Tokenizer` | `adapters/tokenizer/index.ts` (with `TiktokenTokenizer`) | only `container.ts` + the adapter |

`vendor/shared` is hand-synced and mirrored into `client/`, so parking a server-only port there widens
that shared surface for nothing. The decoupling comes from the interface plus the container — not from
the folder. A server-local port is still a port: resolved via `container.tokenizer`, still swappable
through `ContainerOverrides`.

## Adapter: the implementation on the outside

An adapter `implements` a port using a real SDK, in `server/src/adapters/<name>/`:

| Port (core) | Adapter (infrastructure) |
|---|---|
| `LLMProvider` | `adapters/llm/openai.ts` → `OpenAIProvider` |
| `GitHubClient` | `adapters/github/octokit.ts` → `OctokitGitHubClient` |
| `GitClient` | `adapters/git/simple-git.ts` → `SimpleGitClient` |
| `CodeIndex` | `adapters/codeindex/ripgrep.ts` → `RipgrepCodeIndex` |
| `SecretsProvider` | `adapters/secrets/local.ts` → `LocalSecretsProvider` |
| *(all of the above, for tests)* | `adapters/mocks.ts` → `MockLLMProvider`, `MockGitHubClient`, … |

The dependency points inward: the adapter imports the port to implement it; the port knows nothing of the adapter.

## Composition root: `platform/container.ts`

The `Container` is the **only** place allowed to know every concrete class and stitch them together. Inner layers receive what they need from it; they never `new` an adapter themselves.

```ts
export class Container {
  readonly db: Db;
  readonly secrets: SecretsProvider;   // eager — needed everywhere
  readonly auth: AuthProvider;

  // lazy getters — built on first use
  get git(): GitClient { /* overrides.git ?? new SimpleGitClient(...) */ }
  get codeIndex(): CodeIndex { /* ?? new RipgrepCodeIndex(this.git) */ }
  get agentsRepo(): AgentsRepository { /* ??= new AgentsRepository(this.db) */ }

  // async — must fetch a secret key before constructing
  async github(): Promise<GitHubClient> { /* needs GITHUB_TOKEN */ }
  async llm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> { /* cached */ }
}
```

Three resolution shapes, all in the root:
- **Eager** (`db`, `secrets`, `auth`) — built in the constructor.
- **Lazy getter** (`git`, `codeIndex`, `tokenizer`, `agentsRepo`, `reviewRepo`) — built on first access, then memoized.
- **Async** (`github()`, `llm(id)`) — must read a secret first; cached after build.

Note `agentsRepo` / `reviewRepo` live on the container too: shared repositories are constructed in the composition root so a module uses `container.agentsRepo` instead of reaching into another module's folder.

## Consuming a port (the only sanctioned path)

```ts
// application layer — resolve through the container, code against the port
async listModels(provider: Provider): Promise<ModelInfo[]> {
  const llm = await this.container.llm(provider); // LLMProvider, not OpenAI
  return llm.listModels();
}
```

Never this:

```ts
import OpenAI from 'openai';
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); // ❌ rule 3 & 6
```

That hard-wires a vendor into the application ring, leaks the key, and can't be mocked.

## Swapping implementations in tests: `ContainerOverrides`

Because everything resolves through the root, tests replace any port with a mock and inject nothing else:

```ts
const container = new Container(config, db, {
  llm: { openai: new MockLLMProvider(/* canned findings */) },
  github: new MockGitHubClient(),
});
```

The inside doesn't change — it still asks for `LLMProvider`. This swap-without-touching-the-core is the property the whole architecture buys you.

## How to add a new adapter (recipe)

1. **Define the port** — methods in domain terms, no vendor types in the signature. Put it in
   `vendor/shared/adapters.ts` only if a package outside `server/` names the type; if it is server-only
   (the common case for a new capability), declare it in `adapters/<name>/index.ts` beside the adapter.
2. **Implement it** in `adapters/<name>/<impl>.ts` as `class XyzProvider implements YourPort`.
3. **Add a mock** in `adapters/mocks.ts` implementing the same port.
4. **Resolve it** in `platform/container.ts` — a getter (or async method if it needs a secret), honoring `ContainerOverrides`. Add the override field to `ContainerOverrides`.
5. **Consume it** from a service via `this.container.xyz()` — never construct it inline.

Domain and application never change when the vendor does — you only touch steps 2–4.
