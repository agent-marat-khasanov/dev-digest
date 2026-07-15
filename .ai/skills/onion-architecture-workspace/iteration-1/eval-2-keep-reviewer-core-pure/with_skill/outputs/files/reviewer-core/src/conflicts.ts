import type { Finding } from '@devdigest/shared';

/**
 * Cross-PR conflict annotation — the sibling of the grounding gate.
 *
 * A finding is far more actionable when it says "the file you are touching is
 * ALREADY being changed by another open PR". Deciding that is pure set logic,
 * so it lives here in the core and runs on the findings that survived grounding.
 *
 * The engine performs NO I/O. The caller resolves the other open PRs and the
 * files they change through its own `GitHubClient` port (the server does it via
 * `container.github()`) and hands them in as plain data. Nothing in this file
 * knows about GitHub, Octokit, HTTP, or a database.
 */

/** One OTHER open PR in the same repo, plus the repo-relative paths it changes. */
export interface OpenPrChanges {
  number: number;
  title: string;
  author: string;
  /** Repo-relative paths changed by that PR (same shape as `UnifiedDiff.files[].path`). */
  files: string[];
}

/** file path → the other open PRs that already touch it. */
export type ConflictIndex = Map<string, OpenPrChanges[]>;

export interface AnnotatedFindings {
  findings: Finding[];
  /** How many findings received a conflict note (for the run's log / trace). */
  annotated: number;
}

/** At most this many PRs are named in one note; the remainder collapse to "+N more". */
const MAX_PRS_IN_NOTE = 3;

/**
 * Invert "PR → files" into "file → PRs". The PR under review is NOT filtered
 * here — the caller passes only the OTHER open PRs (it is the one that knows
 * which PR is being reviewed).
 */
export function buildConflictIndex(openPrs: OpenPrChanges[]): ConflictIndex {
  const index: ConflictIndex = new Map();
  for (const pr of openPrs) {
    for (const file of pr.files) {
      const list = index.get(file);
      if (list) list.push(pr);
      else index.set(file, [pr]);
    }
  }
  return index;
}

/** The markdown sentence appended to a conflicting finding's rationale. */
export function conflictNote(file: string, prs: OpenPrChanges[]): string {
  const named = prs
    .slice(0, MAX_PRS_IN_NOTE)
    .map((pr) => `#${pr.number} "${pr.title}" (@${pr.author})`);
  const rest = prs.length - named.length;
  const list = rest > 0 ? `${named.join(', ')}, +${rest} more` : named.join(', ');
  return (
    `**Conflict:** \`${file}\` is also changed by ${prs.length} other open PR(s): ${list}. ` +
    `Coordinate before merging — the change suggested here may collide with theirs.`
  );
}

/**
 * Append a conflict note to every finding whose file another open PR already
 * touches. Findings are returned as NEW objects (no mutation); severity, lines
 * and category are untouched — only the human-readable `rationale` grows, so
 * the score derived from these findings is unchanged.
 */
export function annotateConflicts(findings: Finding[], index: ConflictIndex): AnnotatedFindings {
  if (index.size === 0) return { findings, annotated: 0 };
  let annotated = 0;
  const out = findings.map((finding) => {
    const prs = index.get(finding.file);
    if (!prs || prs.length === 0) return finding;
    annotated += 1;
    return {
      ...finding,
      rationale: `${finding.rationale}\n\n${conflictNote(finding.file, prs)}`,
    };
  });
  return { findings: out, annotated };
}
