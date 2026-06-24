# References & Rationale

External sources behind this skill's conventions, grouped by topic. The DevDigest rules are the canon; these explain *why* and provide deeper reading.

## Internal sources (read these first)

- `client/README.md` — UI route map, stack, testing notes.
- `client/INSIGHTS.md` — module gotchas (TanStack Query + apiFetch separation, RSC defaults, popover clipping, lazy-fetch-on-hover, etc.).
- `client/src/vendor/ui/README.md` — design-system layers, theming via CSS variables.
- `CLAUDE.md` / `AGENTS.md` — coding rules (co-location-friendly: no premature abstraction, no comments where names suffice, no over-scoping).
- Sibling skills — `react-best-practices`, `next-best-practices` (techniques/performance), `react-testing-library`, `typescript-expert`, `zod`. This skill is **placement/architecture**; defer technique to those.

## A. React project structure (co-location)

- [Robin Wieruch — React Folder Structure Best Practices](https://www.robinwieruch.de/react-folder-structure/) — flat → type → feature; "don't over-engineer."
- [Max Rozen — Guidelines to improve your React folder structure](https://maxrozen.com/guidelines-improve-react-app-folder-structure) — keep code close to where it's used.
- [WebDevSimplified — How To Structure React Projects](https://blog.webdevsimplified.com/2022-07/react-folder-structure/) — feature folders with `index` public API.
- [React (legacy) docs — File Structure](https://legacy.reactjs.org/docs/faq-structure.html) — "no opinions"; limit nesting depth.
- [Netguru — Professional React Project Structure 2025](https://www.netguru.com/blog/react-project-structure)

## B. Next.js 15 App Router structure

- [Next.js docs — Project Structure](https://nextjs.org/docs/app/getting-started/project-structure) — route groups `(group)`, private folders `_folder`, safe colocation.
- [DEV — Best Practices for Organizing Your Next.js 15 (2025)](https://dev.to/bajrayejoon/best-practices-for-organizing-your-nextjs-15-2025-53ji)
- [Melvin Prince — Inside the App Router (2025 Edition)](https://medium.com/better-dev-nextjs-react/inside-the-app-router-best-practices-for-next-js-file-and-directory-structure-2025-edition-ed6bc14a8da3)

## C. Separating business logic from UI

- [patterns.dev — Container/Presentational Pattern](https://www.patterns.dev/react/presentational-container-pattern/)
- [Felix Gerschau — Separation of concerns with React hooks](https://felixgerschau.com/react-hooks-separation-of-concerns/) — custom hooks as the modern container replacement.
- [Martin Buchalik — The Controller Pattern](https://medium.com/@MBuchalik/the-controller-pattern-separate-business-logic-from-presentation-in-react-331f72fcb32a) — `useController()` + presentational component.
- [Refine — React Design Patterns](https://refine.dev/blog/react-design-patterns/)

## D. Server/Client component boundary (placement)

- [Next.js docs — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) — "move Client Components to the leaves."
- [iamraghuveer — Drawing the Right Boundary](https://www.iamraghuveer.com/posts/nextjs-server-vs-client-components/) — `"use client"` as a contagious boundary.
- [Vercel Academy — Client-Server Boundaries](https://vercel.com/academy/nextjs-foundations/client-server-boundaries)
- [LogRocket — 6 RSC pitfalls in Next.js](https://blog.logrocket.com/react-server-components-performance-mistakes)

## E. Human-friendly / AI-legible code

- [Stack Overflow Blog — Coding guidelines for AI agents (and people too)](https://stackoverflow.blog/2026/03/26/coding-guidelines-for-ai-agents-and-people-too/)
- [JetBrains — Coding Guidelines for Your AI Agents](https://blog.jetbrains.com/idea/2025/05/coding-guidelines-for-your-ai-agents/) — bootstrap a guidelines file from the codebase.
- [TianPan — The AI-Legible Codebase](https://tianpan.co/blog/2026-04-13-the-ai-legible-codebase) — "semantic density."
- [Atlassian Research — Code Readability in the Age of LLMs](https://www.atlassian.com/blog/artificial-intelligence/atlassian-research-developers-on-code-readibility-llm) — 81% still value readability.
- [Nolan Lawson — How I use AI agents to write code](https://nolanlawson.com/2025/12/22/how-i-use-ai-agents-to-write-code/)
