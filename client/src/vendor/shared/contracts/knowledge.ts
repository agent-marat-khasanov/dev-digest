import { z } from 'zod';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding ----
export const OnboardingLink = z.object({
  label: z.string(),
  path: z.string(),
});
export type OnboardingLink = z.infer<typeof OnboardingLink>;

export const OnboardingSection = z.object({
  kind: z.string(),
  title: z.string(),
  body: z.string(), // markdown
  diagram: z.string().nullish(), // mermaid
  links: z.array(OnboardingLink),
});
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const Onboarding = z.object({
  sections: z.array(OnboardingSection),
});
export type Onboarding = z.infer<typeof Onboarding>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum(['manual', 'imported_url', 'extracted', 'community']);
export type SkillSource = z.infer<typeof SkillSource>;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
  // Optional usage stats embedded by GET /skills + GET /skills/:id so the
  // SkillCard and the body editor header don't need separate round trips.
  agents_count: z.number().int().nonnegative().optional(),
  pull_frequency_pct: z.number().min(0).max(100).optional(),
  accept_rate_pct: z.number().min(0).max(100).optional(),
  body_tokens: z.number().int().nonnegative().optional(),
});
export type Skill = z.infer<typeof Skill>;

// 30-day rollup behind /skills/:id/stats — same numbers the cards embed, plus
// the agents list and per-category findings buckets for the Stats tab donut.
export const SkillStats = z.object({
  used_by: z.number().int().nonnegative(),
  pull_frequency_pct: z.number().min(0).max(100),
  accept_rate_pct: z.number().min(0).max(100),
  findings_count_30d: z.number().int().nonnegative(),
  agents_using: z.array(z.object({ id: z.string(), name: z.string() })),
  findings_by_category: z.array(
    z.object({ category: z.string(), value: z.number().int().nonnegative() }),
  ),
});
export type SkillStats = z.infer<typeof SkillStats>;

export const SkillVersionDiff = z.object({
  unified: z.string(),
});
export type SkillVersionDiff = z.infer<typeof SkillVersionDiff>;

// Input shapes for the skills CRUD module. `name/description/type/body` are
// always required on create; `enabled` defaults to true. `source` is set
// server-side from the request origin (manual create vs. imported).
export const CreateSkillInput = z.object({
  name: z.string().min(1),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  enabled: z.boolean().default(true),
  source: SkillSource.default('manual'),
  evidence_files: z.array(z.string()).nullish(),
});
export type CreateSkillInput = z.infer<typeof CreateSkillInput>;

export const UpdateSkillInput = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().optional(),
  enabled: z.boolean().optional(),
  evidence_files: z.array(z.string()).nullish(),
});
export type UpdateSkillInput = z.infer<typeof UpdateSkillInput>;

export const SkillListQuery = z.object({
  type: SkillType.optional(),
  enabled: z.coerce.boolean().optional(),
});
export type SkillListQuery = z.infer<typeof SkillListQuery>;

// Returned by /skills/import/preview — parsed but NOT persisted. The client
// inspects this and decides whether to POST /skills with the parsed payload.
export const SkillImportPreview = z.object({
  parsed: z.object({
    name: z.string(),
    description: z.string(),
    type: SkillType,
    body: z.string(),
    evidence_files: z.array(z.string()).nullish(),
  }),
  format: z.enum(['markdown', 'archive']),
  warnings: z.array(z.string()),
});
export type SkillImportPreview = z.infer<typeof SkillImportPreview>;

export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
  type: SkillType,
  body: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// ---- Conventions ----
export const ConventionCandidate = z.object({
  id: z.string(),
  rule: z.string(),
  evidence_path: z.string(),
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
  accepted: z.boolean(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

// ---- Agents ----
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a CI review should BLOCK (REQUEST_CHANGES + fail the
// check) vs just comment. Deterministic from severities; acted on ONLY in CI.
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
  // Per-agent active state. A skill is injected into THIS agent's prompt only
  // when both `skills.enabled` and this `enabled` are true.
  enabled: z.boolean().default(true),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;
