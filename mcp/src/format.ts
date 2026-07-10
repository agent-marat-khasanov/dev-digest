/**
 * Compact response shaping. Tools return only the fields the model needs — never
 * a raw API dump (a full dump can burn tens of thousands of tokens).
 */
import type { Agent, Convention, Finding, ReviewRecord } from '@devdigest/shared';

export type VerdictStatus = 'pass' | 'blocked';

export interface Verdict {
  status: VerdictStatus;
  score: number | null;
  counts: { critical: number; warning: number; suggestion: number };
}

export type CompactFinding = Pick<
  Finding,
  'severity' | 'category' | 'title' | 'file' | 'start_line' | 'end_line' | 'rationale' | 'confidence'
> & { suggestion: string | null };

export function compactFinding(f: Finding): CompactFinding {
  return {
    severity: f.severity,
    category: f.category,
    title: f.title,
    file: f.file,
    start_line: f.start_line,
    end_line: f.end_line,
    rationale: f.rationale,
    suggestion: f.suggestion ?? null,
    confidence: f.confidence,
  };
}

/**
 * Derive { verdict, findings[] } from persisted reviews. Only `kind === 'review'`
 * records are counted — `kind === 'summary'` rows would double-count findings.
 * status is 'blocked' iff any CRITICAL finding exists; score is the LOWEST
 * non-null review score (most conservative when several agents ran).
 */
export function buildVerdict(reviews: ReviewRecord[]): { verdict: Verdict; findings: CompactFinding[] } {
  const records = reviews.filter((r) => r.kind === 'review');
  const findings = records.flatMap((r) => r.findings).map(compactFinding);

  const counts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.severity === 'CRITICAL') counts.critical += 1;
    else if (f.severity === 'WARNING') counts.warning += 1;
    else counts.suggestion += 1;
  }

  const scores = records.map((r) => r.score).filter((s): s is number => s != null);
  const score = scores.length > 0 ? Math.min(...scores) : null;
  const status: VerdictStatus = counts.critical > 0 ? 'blocked' : 'pass';

  return { verdict: { status, score, counts }, findings };
}

export function compactAgent(a: Agent) {
  return { id: a.id, name: a.name, provider: a.provider, model: a.model, enabled: a.enabled };
}

export function compactConvention(c: Convention) {
  return {
    rule: c.rule,
    category: c.category ?? null,
    evidence: c.evidence ?? null,
    confidence: c.confidence ?? null,
    status: c.status,
  };
}
