import type { CommunitySkill } from '@devdigest/shared';

/**
 * Community skill catalogue. Hand-curated for the lesson — each entry carries
 * a vetted, pre-baked body so import is a one-shot POST /skills with the
 * parsed payload and `source: 'community'`. A future lesson can swap this
 * fixture for a live fetch from a registry; the contract stays the same.
 */
export const COMMUNITY_SKILLS: readonly CommunitySkill[] = [
  {
    name: 'owasp-top-10-review',
    repo: 'secdev/agent-skills',
    stars: 1240,
    lang: 'any',
    desc: 'Maps diff changes to the OWASP Top 10 with CWE references.',
    type: 'security',
    body: `# OWASP Top 10 Review

For every changed file, walk the OWASP Top 10:2025 categories and flag any
diff line that introduces a class-level risk. Cite the CWE id in the
rationale (e.g. CWE-79 for reflected XSS). Skip categories that aren't
relevant to the changed code.`,
  },
  {
    name: 'react-hooks-rules',
    repo: 'frontend-guild/skills',
    stars: 842,
    lang: 'TypeScript',
    desc: 'Detects conditional hooks, missing deps, stale closures.',
    type: 'convention',
    body: `# React Hooks Rules

Refuse the diff if it introduces a hook called conditionally, inside a loop,
or after an early return — violations of React's Rules of Hooks.
Also flag useEffect / useMemo / useCallback with missing dependencies or
known stale-closure shapes (deps array referencing a variable that escapes
the closure).`,
  },
  {
    name: 'sql-injection-gate',
    repo: 'secdev/agent-skills',
    stars: 690,
    lang: 'any',
    desc: 'Flags string-concatenated SQL and unparameterized queries.',
    type: 'security',
    body: `# SQL Injection Gate

Refuse any diff that builds SQL by string-concatenating untrusted input.
Tagged template literals + parameterized placeholders are fine
(\`db.query\` followed by \`$1\` etc.). Look for: string interpolation in
\`db.query\` / \`pool.execute\` / Drizzle's \`sql\` template, or any
\`new Function(...)\` over query text.`,
  },
  {
    name: 'a11y-jsx-audit',
    repo: 'a11y-collective/skills',
    stars: 318,
    lang: 'TypeScript',
    desc: 'Checks JSX for missing alt text, ARIA, and focus traps.',
    type: 'convention',
    body: `# Accessibility (JSX)

For every new JSX element, ensure: <img> has alt, <button> has accessible
text, interactive divs use role + keyboard handlers, modals trap focus and
return it on close. Flag any onClick handler attached to a non-button
element without a corresponding onKeyDown.`,
  },
  {
    name: 'lethal-trifecta',
    repo: 'secdev/agent-skills',
    stars: 512,
    lang: 'any',
    desc: 'Flags PRs combining untrusted input + private data + exfiltration.',
    type: 'security',
    body: `# Lethal Trifecta

Only set kind="lethal_trifecta" when ONE flow reaches all three of:
(1) untrusted content the agent ingests, (2) private data it can read,
(3) an outbound channel an attacker can read. Cite a concrete file:line for
each. A normal authenticated endpoint that returns user data is NOT a
trifecta — that is plain authz.`,
  },
  {
    name: 'phantom-api-gate',
    repo: 'secdev/agent-skills',
    stars: 287,
    lang: 'any',
    desc: 'Blocks usage of functions/methods that do not exist in the codebase.',
    type: 'security',
    body: `# Phantom API Gate

Refuse any diff that calls a function, method, or module that does not
exist in the codebase or its declared dependencies. AI-assisted edits
sometimes hallucinate plausible-sounding helpers; the test suite catches
runtime failures but not pure import-only paths. Name the file:line and
the closest real symbol if one exists.`,
  },
  {
    name: 'n-plus-one-detector',
    repo: 'perf-guild/skills',
    stars: 415,
    lang: 'TypeScript',
    desc: 'Flags database queries inside loops and map callbacks.',
    type: 'custom',
    body: `# N+1 Query Detector

Refuse any diff that issues a database query inside a \`for\`/\`while\`
loop, a \`.map\` callback, or a \`forEach\`. Suggest batching with
\`inArray\`, a join, or a relation include. Flag eager .then(...) chains
that hide the iteration.`,
  },
  {
    name: 'no-then-chains',
    repo: 'frontend-guild/skills',
    stars: 198,
    lang: 'TypeScript',
    desc: 'Project convention: async/await everywhere, no .then() chains.',
    type: 'convention',
    body: `# No .then chains

Flag any new \`.then(...)\` or \`.catch(...)\` chain introduced in this diff
and suggest the await rewrite. Existing chains in unchanged code are out of
scope. Promise.all is fine; .then on its result is not.`,
  },
  {
    name: 'secret-leakage-gate',
    repo: 'secdev/agent-skills',
    stars: 1102,
    lang: 'any',
    desc: 'Detects sk_live, service_role, and NEXT_PUBLIC_ keys.',
    type: 'security',
    body: `# Secret Leakage Gate

Reject any diff that introduces a hardcoded secret. Common shapes:
sk_live_*/sk_test_* (Stripe), xox[bpars]- (Slack), ghp_/gho_/ghu_ (GitHub),
AKIA[0-9A-Z]{16} (AWS), Google AIza keys, PEM private-key blocks,
PASSWORD/API_KEY/SECRET = "..." literals, or NEXT_PUBLIC_* keys carrying
server-side credentials. Skip obvious placeholders (xxx, changeme).`,
  },
  {
    name: 'commit-message-rubric',
    repo: 'devx-collective/skills',
    stars: 142,
    lang: 'any',
    desc: 'Scores commit messages on subject line, body, and references.',
    type: 'rubric',
    body: `# Commit Message Rubric

Score each commit in the PR on: subject ≤ 50 chars, imperative mood, body
explains the why (not the what), references an issue or design doc when
applicable, no trailing whitespace. Surface only the lowest-scoring
commits — perfect commits don't need feedback.`,
  },
  {
    name: 'test-coverage-nudge',
    repo: 'devx-collective/skills',
    stars: 256,
    lang: 'any',
    desc: 'Suggests tests when new branches lack assertions.',
    type: 'custom',
    body: `# Test Coverage Nudge

For every new conditional (if / switch / ternary / early return) in
production code, check that at least one test asserts the new branch.
Missing branch coverage on a fall-through default is a WARNING; missing
coverage on an error/exception path is CRITICAL.`,
  },
  {
    name: 'breaking-change-detector',
    repo: 'devx-collective/skills',
    stars: 367,
    lang: 'any',
    desc: 'Detects route, contract, and exported API signature changes.',
    type: 'custom',
    body: `# Breaking Change Detector

Flag any change to a route signature, response shape, Zod contract, or
exported function signature. Cite the file:line and call out the
consumer-facing impact (existing clients break, mobile apps need release,
etc.). A pure widening (adding an optional field) is not a breaking change.`,
  },
] as const;

export interface CommunityFilter {
  q?: string;
  lang?: string;
}

/**
 * Case-insensitive substring match on name / desc / repo plus optional exact
 * lang match. Returns the catalogue unchanged for empty filters. Pure — no I/O.
 */
export function filterCommunitySkills(
  skills: readonly CommunitySkill[],
  filter: CommunityFilter,
): CommunitySkill[] {
  const q = filter.q?.trim().toLowerCase() ?? '';
  const lang = filter.lang?.trim().toLowerCase() ?? '';
  return skills.filter((s) => {
    if (lang && s.lang.toLowerCase() !== lang) return false;
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.desc.toLowerCase().includes(q) ||
      s.repo.toLowerCase().includes(q)
    );
  });
}
