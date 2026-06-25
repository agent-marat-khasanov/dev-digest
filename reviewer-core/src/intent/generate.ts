import { z } from 'zod';
import type { ChatMessage, LLMProvider } from '@devdigest/shared';
import { INJECTION_GUARD, wrapUntrusted } from '../prompt.js';

/**
 * Local schema for the LLM structured-output call.
 * Mirrors the shape of the shared Intent + Risk contracts so the server can
 * map 1:1 when it persists, but lives here (not in vendor/shared) to keep
 * reviewer-core pure.
 *
 * MUST be an object root — completeStructured uses tool-use / json_schema
 * and tool inputs must be objects; a bare z.array root fails.
 */
export const IntentDraftSchema = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  risks: z.array(
    z.object({
      kind: z.string(),
      title: z.string(),
      explanation: z.string(),
      severity: z.enum(['high', 'medium', 'low']),
      file_refs: z.array(z.string()),
    }),
  ),
});

export type IntentDraft = z.infer<typeof IntentDraftSchema>;

const INTENT_SYSTEM_PROMPT =
  'You are a pull-request analyst. Given a pull request and optionally a linked ' +
  'specification or plan, produce a structured intent summary.\n\n' +
  '## Motivation-source priority (CRITICAL — follow in order)\n' +
  '1. If a <untrusted source="linked_spec"> block is present, it is the AUTHORITATIVE ' +
  'source of truth. Derive intent, in_scope, and out_of_scope DIRECTLY from it. ' +
  'The diff confirms the plan is being executed; do not let the diff override the spec.\n' +
  '2. If no linked spec is present but the PR body contains a detailed plan, ' +
  'specification, task list, or motivation statement, treat the body as AUTHORITATIVE ' +
  'in the same way.\n' +
  '3. If neither a spec nor a substantive body is present, INFER the intent from the ' +
  'PR title, the list of changed files, and the diff. This path MUST NEVER fail — ' +
  'always produce a best-effort summary even when the body is empty and no spec exists.\n\n' +
  '## Output fields\n' +
  '- intent: one sentence capturing the core motivation (quote/paraphrase the plan when ' +
  'present; otherwise write a concise inferred statement)\n' +
  '- in_scope: 1–5 concrete things this PR adds or changes\n' +
  '- out_of_scope: 0–5 related things this PR explicitly excludes or defers (may be empty)\n' +
  '- risks: 0–5 concrete risk areas introduced or touched by the diff. Each risk needs: ' +
  'kind (short category tag, e.g. "auth", "dependency", "network", "schema", "crypto"), ' +
  'title (brief label), explanation (one sentence grounding it in the diff), ' +
  'severity ("high"|"medium"|"low"), file_refs (file paths from the diff). ' +
  'Only report risks grounded in the actual diff — do NOT invent risks absent from the code.\n\n' +
  '## Absolute requirements\n' +
  'ALWAYS return a valid JSON object. NEVER refuse or return an error message, ' +
  'even when inputs are minimal or no plan/spec is provided.\n\n' +
  INJECTION_GUARD;

export async function generateIntent(input: {
  llm: LLMProvider;
  model: string;
  title: string;
  body: string | null;
  spec?: { title: string; body: string | null } | null;
  changedFiles: string[];
  diff: string;
  maxRetries?: number;
}): Promise<IntentDraft> {
  const userSections: string[] = [];

  userSections.push(wrapUntrusted('pr_title', input.title));

  if (input.body !== null && input.body.trim().length > 0) {
    userSections.push(wrapUntrusted('pr_body', input.body));
  }

  if (input.spec != null) {
    const specParts: string[] = [input.spec.title];
    if (input.spec.body !== null && input.spec.body.trim().length > 0) {
      specParts.push(input.spec.body);
    }
    userSections.push(wrapUntrusted('linked_spec', specParts.join('\n\n')));
  }

  if (input.changedFiles.length > 0) {
    userSections.push(wrapUntrusted('changed_files', input.changedFiles.join('\n')));
  }

  userSections.push(wrapUntrusted('diff', input.diff));

  const messages: ChatMessage[] = [
    { role: 'system', content: INTENT_SYSTEM_PROMPT },
    { role: 'user', content: userSections.join('\n\n') },
  ];

  const res = await input.llm.completeStructured<IntentDraft>({
    model: input.model,
    schema: IntentDraftSchema,
    schemaName: 'Intent',
    messages,
    maxRetries: input.maxRetries ?? 2,
  });

  return res.data;
}
