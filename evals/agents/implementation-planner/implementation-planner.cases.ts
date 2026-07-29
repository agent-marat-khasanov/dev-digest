import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

// `implementation-planner` declares `Write` in its frontmatter, but agentTask strips mutating
// tools (see artifacts/load.ts MUTATING_TOOLS), so it runs read-only here and answers with the
// plan's content directly instead of writing `.ai/plans/<feature>.md` — exactly what a
// content-quality eval needs. Specs/INSIGHTS are inlined so the case is reproducible and doesn't
// depend on the real repo's ever-changing INSIGHTS.md/spec set.

const fx = fixtureReader(import.meta.url);
const SPEC_WEBHOOK_RETRY = fx("spec-webhook-retry.md");
const WEBHOOKS_INSIGHTS = fx("webhooks-insights.md");
const SPEC_TAG_SEARCH = fx("spec-tag-search.md");
const SPEC_COMMENT_EXPORT = fx("spec-comment-export.md");

export const cases: AgentCase[] = [
  {
    name: "mines module INSIGHTS.md into the plan's Known gotchas section, citing the source",
    kind: "quality",
    prompt: `Plan the implementation of this approved spec. The \`webhooks\` module's INSIGHTS.md is given below as well — mine it for a "Known gotchas" section of your Implementation Plan, citing where each gotcha came from.\n\n## Spec\n\n${SPEC_WEBHOOK_RETRY}\n\n## server/src/modules/webhooks/INSIGHTS.md\n\n${WEBHOOKS_INSIGHTS}`,
    grounding: ["INSIGHTS"],
    practices: [
      "extracted the in-memory retry-counter gotcha (retry state must live in the webhook_deliveries row, not an in-memory Map, because it resets on redeploy) into a Known gotchas / gotchas section",
      "extracted the hardcoded-httpClient-timeout gotcha (must use the shared httpClient port instead of constructing a client directly) into the same section",
      "cites INSIGHTS.md (or the webhooks module's INSIGHTS file) as the source of these gotchas, not just stating them unattributed",
    ],
    threshold: 0.6,
    maxTurns: 8,
  },
  {
    name: "maps a backend task to skills in skill-routing order, architecture skill first",
    kind: "quality",
    prompt: `Plan the implementation of this approved spec — a new backend route in \`server/src/modules/tags/\`. For each coding task, list the Required skills in the order the implementer must invoke them.\n\n${SPEC_TAG_SEARCH}`,
    grounding: ["tags"],
    practices: [
      "lists onion-architecture as the FIRST required skill for the backend route task, before any other skill",
      "lists fastify-best-practices as a required skill for the route/handler work (this is a new Fastify route)",
      "the skill order matches the backend skill-routing rule: architecture/placement skill first, then framework skills (fastify/drizzle/zod/security/typescript as relevant) — never a framework skill listed before the architecture skill",
    ],
    threshold: 0.6,
    maxTurns: 8,
  },
  {
    name: "does not invent requirements the spec never states — surfaces gaps as open questions instead",
    kind: "quality",
    prompt: `Plan the implementation of this approved spec.\n\n${SPEC_COMMENT_EXPORT}`,
    grounding: ["AC-1"],
    practices: [
      "does not silently invent a behavior for the PR-not-found case (e.g. does not just assert '404 if PR not found' as if it were a stated AC) — treats it as a gap/open question the spec never addresses",
      "does not silently invent a behavior for the zero-comments case (e.g. does not assert 'return 204' or similar as if the spec required it) — treats it as a gap/open question",
      "does not add scope beyond AC-1 (e.g. does not add pagination, CSV export, or author/date filtering, which the spec's Non-goals explicitly exclude)",
    ],
    threshold: 0.6,
    maxTurns: 8,
  },
];
