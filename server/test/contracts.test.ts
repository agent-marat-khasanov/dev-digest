import { describe, it, expect } from 'vitest';
import {
  Review,
  Finding,
  Intent,
  BlastRadius,
  Risks,
  Brief,
  SmartDiff,
  Conformance,
  OnboardingTour,
  TourSection,
  EvalRun,
  EvalRunRecord,
  EvalDashboardOverview,
  MemoryItem,
  RunTrace,
  Settings,
  Repo,
  PrDetail,
  ContextDoc,
  ContextPreview,
  AgentContextLink,
  SkillContextLink,
  SetContextBody,
  SpecBlock,
  PromptAssembly,
} from '@devdigest/shared';

/**
 * Contract tests — parse/round-trip the fixtures from data.jsx/data2.jsx
 * so feature agents can rely on the schemas matching the prototype data.
 */
describe('AI contracts parse fixtures', () => {
  it('Review + Finding (data.jsx VERDICT/FINDINGS)', () => {
    const review = Review.parse({
      verdict: 'request_changes',
      summary: 'Two blockers before merge.',
      score: 61,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key in commit',
          file: 'src/config.ts',
          start_line: 12,
          end_line: 12,
          rationale: 'Line 12 contains a literal `sk_live_` Stripe key.',
          suggestion: 'Move to env and rotate.',
          confidence: 0.98,
          kind: 'secret_leak',
        },
      ],
    });
    expect(review.findings).toHaveLength(1);
    expect(review.score).toBe(61);
  });

  it('lethal-trifecta Finding variant', () => {
    const f = Finding.parse({
      id: 'f2',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Lethal trifecta',
      file: 'src/api/public/webhooks.ts',
      start_line: 61,
      end_line: 74,
      rationale: 'all three legs present',
      confidence: 0.79,
      kind: 'lethal_trifecta',
      trifecta_components: ['private_data_access', 'untrusted_input', 'exfil_path'],
      evidence: [{ component: 'untrusted_input', file: 'src/api/public/webhooks.ts', line: 61 }],
    });
    expect(f.trifecta_components).toContain('exfil_path');
  });

  it('Intent / BlastRadius / Risks / Brief', () => {
    expect(() =>
      Intent.parse({ intent: 'x', in_scope: ['a'], out_of_scope: ['b'] }),
    ).not.toThrow();
    expect(() =>
      BlastRadius.parse({
        changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'rateLimit',
            callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
            endpoints_affected: ['GET /x'],
            crons_affected: ['c'],
          },
        ],
        summary: 's',
      }),
    ).not.toThrow();
    expect(() =>
      Risks.parse({
        risks: [{ kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      Brief.parse({
        pr_id: '482',
        what: 'Adds rate limiting to the public API.',
        why: 'Prevent abuse of the public webhook endpoint.',
        risk_level: 'high',
        risks: [
          { kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: ['a.ts'] },
        ],
        review_focus: [{ path: 'a.ts', reason: 'core rate-limit logic' }],
        generated_at: '2026-07-13T00:00:00.000Z',
        generated: { model: 'gpt-4.1', cost_usd: 0.0032, tokens_in: 1400, tokens_out: 320 },
      }),
    ).not.toThrow();
    expect(() =>
      Brief.parse({
        pr_id: '482',
        what: 'w',
        why: 'y',
        risk_level: 'low',
        risks: [],
        review_focus: [],
      }),
    ).not.toThrow();
  });

  it('SmartDiff (data.jsx DIFF)', () => {
    const d = SmartDiff.parse({
      groups: [
        {
          role: 'core',
          files: [{ path: 'a.ts', additions: 84, deletions: 0, finding_lines: [28, 52] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 285, proposed_splits: [] },
    });
    expect(d.groups[0]!.role).toBe('core');
  });

  it('Conformance / OnboardingTour / EvalRun / MemoryItem', () => {
    expect(() =>
      Conformance.parse({
        spec_id: 's1',
        spec_title: 'Spec',
        items: [{ requirement: 'r', status: 'implemented' }],
        completeness_pct: 80,
      }),
    ).not.toThrow();
    expect(() =>
      TourSection.parse({
        id: 'critical_paths',
        title: 'Critical paths',
        body: 'b',
        diagram: null,
        links: [{ label: 'entry point', path: 'src/index.ts' }],
        commands: null,
      }),
    ).not.toThrow();
    expect(() =>
      OnboardingTour.parse({
        repo_id: 'r1',
        mode: 'model',
        reason: null,
        sections: [
          { id: 'architecture', title: 'Architecture', body: 'b', diagram: 'graph TD;A-->B;', links: [] },
          { id: 'critical_paths', title: 'Critical paths', body: 'b', links: [{ label: 'entry', path: 'a.ts' }] },
          { id: 'run_locally', title: 'Run locally', body: 'b', commands: ['pnpm install', 'pnpm dev'] },
          { id: 'reading_path', title: 'Reading path', body: 'b', links: [{ label: 'why read this', path: 'a.ts' }] },
          { id: 'first_tasks', title: 'First tasks', body: 'b' },
        ],
        index: { files_indexed: 42, sha: 'abc123' },
        generated_at: '2026-07-12T00:00:00.000Z',
        generated: { model: 'deepseek/deepseek-v4-flash', cost_usd: 0.0021, tokens_in: 1200, tokens_out: 400 },
      }),
    ).not.toThrow();
    expect(() =>
      OnboardingTour.parse({
        repo_id: 'r1',
        mode: 'not_available',
        reason: 'not_cloned',
        sections: [],
        index: { files_indexed: 0, sha: null },
        generated_at: null,
        generated: null,
      }),
    ).not.toThrow();
    expect(() =>
      EvalRun.parse({
        recall: 0.82,
        precision: 0.91,
        citation_accuracy: 0.95,
        traces_passed: 17,
        traces_total: 20,
        duration_ms: 12000,
        cost_usd: 0.23,
        per_trace: [{ name: 't01', pass: true, expected: 'x', actual: 'x' }],
      }),
    ).not.toThrow();
    expect(() =>
      MemoryItem.parse({
        content: 'c',
        scope: 'team',
        kind: 'decision',
        confidence: 0.92,
        sources: [{ pr: 401, context: 'ctx' }],
      }),
    ).not.toThrow();
  });

  it('EvalRunRecord parses agent_version + batch_id (nullable)', () => {
    const base = {
      id: 'run1',
      case_id: 'case1',
      case_name: 'must-find secret leak',
      ran_at: '2026-07-13T00:00:00.000Z',
      actual_output: [],
      pass: true,
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
      duration_ms: 1200,
      cost_usd: 0.01,
    };
    expect(() =>
      EvalRunRecord.parse({ ...base, agent_version: 3, batch_id: 'batch1' }),
    ).not.toThrow();
    expect(() =>
      EvalRunRecord.parse({ ...base, agent_version: null, batch_id: null }),
    ).not.toThrow();
  });

  it('EvalDashboardOverview parses per-agent rows + recent runs', () => {
    const overview = EvalDashboardOverview.parse({
      agents: [
        {
          agent_id: 'a1',
          agent_name: 'Security Reviewer',
          recall: 0.9,
          precision: 0.85,
          citation_accuracy: 1,
          last_run_pass_count: { passed: 7, total: 8 },
        },
        {
          agent_id: 'a2',
          agent_name: 'Style Reviewer',
          recall: null,
          precision: null,
          citation_accuracy: null,
          last_run_pass_count: null,
        },
      ],
      recent_runs: [],
    });
    expect(overview.agents).toHaveLength(2);
    expect(overview.agents[1]!.last_run_pass_count).toBeNull();
  });

  it('RunTrace (data2.jsx TRACE single-document)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', version: 'v7', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: { duration_ms: 8200, tokens_in: 14820, tokens_out: 1240, cost_usd: 0.0014, findings: 3, grounding: '3/3 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [{ tool: 'read_file', args: "'src/config.ts'", meta: '1,240 bytes', ms: 120 }],
      raw_output: '{}',
      memory_pulled: [{ pr: 288, text: 'verified via stripe-signature' }],
      specs_read: ['specs/security-baseline.md'],
      log: [{ t: '00.00', kind: 'info', msg: 'started' }],
    });
    expect(trace.tool_calls).toHaveLength(1);
  });
});

describe('platform DTOs', () => {
  it('Settings defaults + passthrough', () => {
    const s = Settings.parse({ extra_key: 'x' });
    expect(s.theme).toBe('dark');
    expect((s as Record<string, unknown>).extra_key).toBe('x');
  });

  it('Repo + PrDetail', () => {
    expect(() =>
      Repo.parse({
        id: 'r1',
        workspace_id: 'w1',
        owner: 'acme',
        name: 'payments-api',
        full_name: 'acme/payments-api',
        default_branch: 'main',
        clone_path: null,
        last_polled_at: null,
        created_by: null,
      }),
    ).not.toThrow();
    expect(() =>
      PrDetail.parse({
        number: 482,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        head_sha: 'sha',
        additions: 1,
        deletions: 0,
        files_count: 1,
        status: 'open',
        files: [],
        commits: [],
      }),
    ).not.toThrow();
  });
});

describe('project-context contracts', () => {
  it('ContextDoc parses a valid discovered doc', () => {
    const doc = ContextDoc.parse({
      path: 'specs/security-baseline.md',
      folder_type: 'specs',
      size_bytes: 4096,
      tokens: 820,
      updated_at: '2026-06-18T00:00:00.000Z',
    });
    expect(doc.folder_type).toBe('specs');
    expect(doc.tokens).toBe(820);
  });

  it('ContextDoc rejects a bad folder_type', () => {
    expect(() =>
      ContextDoc.parse({
        path: 'specs/security-baseline.md',
        folder_type: 'notes',
        size_bytes: 4096,
        tokens: 820,
      }),
    ).toThrow();
  });

  it('ContextDoc rejects a missing tokens field', () => {
    expect(() =>
      ContextDoc.parse({
        path: 'specs/security-baseline.md',
        folder_type: 'specs',
        size_bytes: 4096,
      }),
    ).toThrow();
  });

  it('ContextPreview parses a valid on-demand preview', () => {
    const preview = ContextPreview.parse({
      path: 'docs/architecture.md',
      content: '# Architecture\n\n...',
    });
    expect(preview.path).toBe('docs/architecture.md');
  });

  it('SetContextBody parses a valid ordered docs array', () => {
    const body = SetContextBody.parse({
      docs: [
        { path: 'specs/security-baseline.md', order: 0 },
        { path: 'docs/architecture.md', order: 1 },
      ],
    });
    expect(body.docs).toHaveLength(2);
  });

  it('SetContextBody rejects a doc missing order', () => {
    expect(() =>
      SetContextBody.parse({
        docs: [{ path: 'specs/security-baseline.md' }],
      }),
    ).toThrow();
  });

  it('SetContextBody rejects a doc missing path', () => {
    expect(() =>
      SetContextBody.parse({
        docs: [{ order: 0 }],
      }),
    ).toThrow();
  });

  it('AgentContextLink / SkillContextLink parse a valid link', () => {
    expect(() =>
      AgentContextLink.parse({
        agent_id: 'a1',
        path: 'specs/security-baseline.md',
        order: 0,
      }),
    ).not.toThrow();
    expect(() =>
      SkillContextLink.parse({
        skill_id: 's1',
        path: 'docs/architecture.md',
        order: 1,
      }),
    ).not.toThrow();
  });

  it('SpecBlock parses and PromptAssembly.spec_blocks handles populated/null/omitted', () => {
    const block = SpecBlock.parse({
      path: 'specs/security-baseline.md',
      tokens: 120,
      body: 'wrapped untrusted spec body',
    });
    expect(block.tokens).toBe(120);

    const base = { system: 's', user: 'u' };

    const withBlocks = PromptAssembly.parse({ ...base, spec_blocks: [block] });
    expect(withBlocks.spec_blocks).toHaveLength(1);

    const withNull = PromptAssembly.parse({ ...base, spec_blocks: null });
    expect(withNull.spec_blocks).toBeNull();

    const omitted = PromptAssembly.parse(base);
    expect(omitted.spec_blocks).toBeUndefined();
  });
});
