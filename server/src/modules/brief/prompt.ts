import { z } from 'zod';
import { INJECTION_GUARD, wrapUntrusted } from '@devdigest/reviewer-core';
import { Risk, RiskSeverity } from '@devdigest/shared';
import type { PromptBlock } from './assemble.js';

/**
 * Model output schema (DISTINCT from the transport `Brief` contract).
 * Wrapped as `z.object` because `completeStructured` forces tool-use and tool
 * inputs must be objects (server INSIGHTS). The service validates
 * `risks[].file_refs` / `review_focus[].path` against the two real-reference
 * allowlists AFTER the call (`validateBrief`, AC-6/AC-7) — this schema only
 * shapes what the model may return.
 */
export const BriefModelOutput = z.object({
  what: z.string(),
  why: z.string(),
  risk_level: RiskSeverity,
  risks: z.array(Risk),
  review_focus: z.array(
    z.object({
      path: z.string(),
      reason: z.string(),
    }),
  ),
});
export type BriefModelOutput = z.infer<typeof BriefModelOutput>;

/**
 * Assembles the user turn from the (already budget-enforced, `enforceBudget`)
 * ordered blocks — every repo/PR-derived block is untrusted data, wrapped
 * individually with `wrapUntrusted` (AC-17). `INJECTION_GUARD` is appended so
 * the reminder travels with the untrusted payload regardless of how the
 * caller renders the system prompt. NEVER pass diff hunks / file bodies /
 * patches here — `gatherArtifacts` already reduced smart-diff to a
 * stats-only view before it reaches this function (NG2).
 */
export function buildUserMessage(blocks: PromptBlock[]): string {
  const sections = blocks.map((b) => wrapUntrusted(b.label, b.body));
  sections.push(INJECTION_GUARD);
  return sections.join('\n\n');
}
