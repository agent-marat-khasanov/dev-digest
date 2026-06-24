# Human-Friendly Code (for humans *and* agents)

We do agentic development, but the code must stay legible to people. Readability now serves **two readers**: the human who reviews and maintains it, and the agent that reads it next session with no memory of this one. Optimize structure for both.

Research backs this up: ~81% of developers say readability stays critical even with LLMs in the loop ([Atlassian](https://www.atlassian.com/blog/artificial-intelligence/atlassian-research-developers-on-code-readibility-llm)). The new lens is **semantic density** — meaning per token an agent must read ([TianPan](https://tianpan.co/blog/2026-04-13-the-ai-legible-codebase)). See [references.md](references.md).

## Principles

### 1. Names carry the intent
A reader (human or agent) should infer purpose from the name without reading the body.
- `usePrActiveRuns`, `relativeTime`, `STATUS_META` — say what they are.
- Avoid `FactoryBuilderFactory`-style noise and mixed conventions (PascalCase components, camelCase functions — pick the convention from [components.md](components.md) and never mix).
- A precise name beats a comment. (CLAUDE.md: *no comments where names are self-explanatory.*)

### 2. Predictable placement is legibility
Co-location and the folder-per-component rule mean an agent can *locate* code by convention instead of searching. "Where's the PR-list filtering logic?" → it's beside the PR-list page, by rule. This is why the placement rules in this skill matter for agents specifically: a navigable codebase is one an agent can edit correctly.

### 3. Clarity over cleverness
- Prefer a few explicit lines over a dense abstraction that hides what happens. (CLAUDE.md: *three similar lines > early abstraction.*)
- Don't pre-build generic helpers for a single caller. Extract on the third use.
- Straight-line, readable logic > terse one-liners that save a line but cost comprehension.

### 4. Comment the *why*, never the *what*
Code says what it does; comments explain why it's non-obvious. The real `api.ts` comment is the model:
```ts
// Only declare a JSON body when one is actually sent — otherwise a body-less
// POST trips Fastify's "Body cannot be empty when content-type is application/json".
```
That's a *why* an agent could not infer from the code. Restating the code is noise that lowers semantic density.

### 5. Small, single-purpose units
One component = one concern. One hook = one slice of logic. This keeps each unit reviewable in isolation and lets an agent change one thing without reading the whole file.

### 6. Self-contained over DRY-at-all-costs
A little duplication that keeps a unit self-explanatory often beats a shared helper that forces the reader to jump files to understand one component. Be pragmatic — DRY when the shared concept is real, not just because two lines rhyme.

## The codebase already encodes intent — read it first

`client/README.md`, `client/INSIGHTS.md`, and `vendor/ui/README.md` are the persistent briefing for this module. Before adding architecture, read them; before finishing non-trivial work, capture new insights (run `/engineering-insights`). Instruction files are the highest-leverage documentation for agentic work ([Stack Overflow](https://stackoverflow.blog/2026/03/26/coding-guidelines-for-ai-agents-and-people-too/), [JetBrains](https://blog.jetbrains.com/idea/2025/05/coding-guidelines-for-your-ai-agents/)).
