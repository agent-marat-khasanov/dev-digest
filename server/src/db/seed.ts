import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
} from './seed-prompts.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, and the three built-in agents (General + Security +
 * Performance), all on the default openrouter/deepseek-v4-flash provider+model.
 *
 * Course lessons populate the other tables (skills, conventions, memory, eval,
 * …) once their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- built-in agents (the three starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description: 'Flags uncovered branches, missed corner cases, over-mocking, and flakes.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  // ---- demo skills (the right-pane list in the Skills Lab design) ----
  // Six short skill bodies, idempotent by (workspace, name). Real bodies are
  // intentionally compact — they exist so the demo + screenshots have content.
  const seedSkills: Array<typeof t.skills.$inferInsert> = [
    {
      workspaceId,
      name: 'pr-quality-rubric',
      description: 'A four-axis rubric (clarity, scope, tests, risk) the reviewer scores the PR against.',
      type: 'rubric',
      source: 'manual',
      body: `Score every PR on four axes (1–5 each) and lead the summary with the totals:
- Clarity: can a teammate understand the change without asking the author?
- Scope: does the diff do one thing, or did unrelated work sneak in?
- Tests: do the new/changed code paths have assertions that would catch a regression?
- Risk: blast radius if this ships wrong (call sites touched, data migrated, contracts changed).
Call out the lowest-scoring axis explicitly in the summary.`,
      enabled: true,
    },
    {
      workspaceId,
      name: 'no-then-chains',
      description: 'Project convention: async/await everywhere; never .then() chains in new code.',
      type: 'convention',
      source: 'manual',
      body: `This codebase uses async/await exclusively. Flag any new \`.then(...)\` or \`.catch(...)\` chain
introduced in this diff and suggest the await rewrite. Existing chains in unchanged code are out of scope.
Promise.all is fine; .then on the result of Promise.all is not.`,
      enabled: true,
    },
    {
      workspaceId,
      name: 'secret-leakage-gate',
      description: 'Refuse to approve a diff that introduces a hardcoded secret or API key.',
      type: 'security',
      source: 'manual',
      body: `Reject any diff that introduces a hardcoded secret. Common shapes to flag as CRITICAL:
- \`sk_live_*\`, \`sk_test_*\` (Stripe), \`xox[bpars]-\` (Slack), \`ghp_\` / \`gho_\` / \`ghu_\` (GitHub)
- \`AKIA[0-9A-Z]{16}\` (AWS access key), Google \`AIza\` keys, private-key PEM blocks
- \`PASSWORD\` / \`API_KEY\` / \`SECRET\` assigned to a literal string in committed source
- A new \`.env*\` file that is not \`.env.example\` with placeholder values
Don't flag values that are obviously placeholders (\`xxx\`, \`changeme\`, \`<set-me>\`).`,
      enabled: true,
    },
    {
      workspaceId,
      name: 'lethal-trifecta',
      description: 'Flag a single flow that combines untrusted input + private data + exfiltration.',
      type: 'security',
      source: 'manual',
      body: `The lethal trifecta is the agent-specific risk where ONE flow reaches all three of:
(1) UNTRUSTED content the agent ingests (PR body, web page, file, tool output),
(2) PRIVATE data the agent can read,
(3) an EXFILTRATION channel (outbound HTTP, tool call, attacker-readable output).
Only set \`kind: "lethal_trifecta"\` when you can cite a concrete file:line for each of the three.
A normal authenticated endpoint that returns user data is NOT a trifecta — that is plain authz.`,
      enabled: true,
    },
    {
      workspaceId,
      name: 'phantom-api-gate',
      description: 'Block usage of APIs/functions/methods that do not exist in the codebase or its deps.',
      type: 'security',
      source: 'manual',
      body: `Flag (CRITICAL) any call in the diff to a function, method, or module that does not exist in
the codebase or its declared dependencies. AI-assisted edits sometimes hallucinate a plausible-sounding
helper — the test suite will fail at runtime, but a missed import-only path can ship.
For each finding name the file:line, the called symbol, and the closest real symbol if one exists.`,
      enabled: true,
    },
    {
      workspaceId,
      name: 'test-coverage-nudge',
      description: 'Nudge the author to add a test for any new branch in production code.',
      type: 'custom',
      source: 'manual',
      body: `For every new conditional (\`if\` / \`switch\` / ternary / early return) in production code in
this diff, check that at least one test asserts the new branch's behaviour. Missing branch coverage on a
function with a fall-through default is a WARNING; missing coverage on an error/exception path is CRITICAL.
Ignore tests that exist but only exercise the happy path — name the specific branch that lacks an assertion.`,
      enabled: true,
    },
  ];
  for (const s of seedSkills) {
    const [existing] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, s.name)));
    if (!existing) {
      const [row] = await db.insert(t.skills).values(s).returning();
      await db.insert(t.skillVersions).values({
        skillId: row!.id,
        version: 1,
        body: s.body!,
      });
    }
  }

  // ---- agent_skills bindings matching the design (Image #4) ----
  // Security Reviewer: 6 bound, 3 enabled. Test Quality Reviewer: 1 bound, enabled.
  // Idempotent — fetch ids each run; insert only when the link is missing.
  const skillRows = await db
    .select({ id: t.skills.id, name: t.skills.name })
    .from(t.skills)
    .where(eq(t.skills.workspaceId, workspaceId));
  const skillByName = new Map(skillRows.map((r) => [r.name, r.id]));

  const agentRows = await db
    .select({ id: t.agents.id, name: t.agents.name })
    .from(t.agents)
    .where(eq(t.agents.workspaceId, workspaceId));
  const agentByName = new Map(agentRows.map((r) => [r.name, r.id]));

  const securityId = agentByName.get('Security Reviewer');
  const testQualityId = agentByName.get('Test Quality Reviewer');

  const securityBindings: Array<{ skill: string; enabled: boolean }> = [
    { skill: 'pr-quality-rubric',   enabled: true },
    { skill: 'no-then-chains',      enabled: false },
    { skill: 'secret-leakage-gate', enabled: true },
    { skill: 'lethal-trifecta',     enabled: true },
    { skill: 'phantom-api-gate',    enabled: false },
    { skill: 'test-coverage-nudge', enabled: false },
  ];
  if (securityId) {
    for (let i = 0; i < securityBindings.length; i++) {
      const b = securityBindings[i]!;
      const skillId = skillByName.get(b.skill);
      if (!skillId) continue;
      await db
        .insert(t.agentSkills)
        .values({ agentId: securityId, skillId, order: i, enabled: b.enabled })
        .onConflictDoNothing();
    }
  }
  if (testQualityId) {
    const skillId = skillByName.get('test-coverage-nudge');
    if (skillId) {
      await db
        .insert(t.agentSkills)
        .values({ agentId: testQualityId, skillId, order: 0, enabled: true })
        .onConflictDoNothing();
    }
  }

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
