import type { Finding, OpenPrFiles } from '@devdigest/shared';

/**
 * Open-PR overlap — a deterministic post-step on the findings (like grounding).
 *
 * A finding whose file is ALSO changed by another open PR gets a note appended
 * to its rationale, so the reader knows the fix may collide with work already
 * in flight. No model call, no I/O: the engine stays pure — the CALLER fetches
 * the open PRs + their changed files from GitHub (server: GitHubClient port)
 * and hands them in as plain data.
 */

/** file path → the open PRs that also change it. */
export function buildTouchedFileIndex(openPrs: OpenPrFiles[]): Map<string, OpenPrFiles[]> {
  const index = new Map<string, OpenPrFiles[]>();
  for (const pr of openPrs) {
    for (const file of pr.files) {
      const prs = index.get(file) ?? [];
      prs.push(pr);
      index.set(file, prs);
    }
  }
  return index;
}

function overlapNote(file: string, prs: OpenPrFiles[]): string {
  const refs = prs.map((p) => `#${p.number} "${p.title}" (@${p.author})`).join(', ');
  const label = prs.length === 1 ? 'another open PR' : `${prs.length} other open PRs`;
  return (
    `\n\n**Open-PR conflict:** \`${file}\` is also changed by ${label} — ${refs}. ` +
    'Coordinate before merging: a fix here may collide with that work.'
  );
}

/**
 * Append the conflict note to every finding whose file is touched by another
 * open PR. Findings on untouched files are returned AS-IS (same object, same
 * text), so an empty `openPrs` list is a no-op and the output is byte-identical
 * to the pre-feature shape.
 */
export function annotateOpenPrOverlaps(findings: Finding[], openPrs: OpenPrFiles[]): Finding[] {
  if (openPrs.length === 0) return findings;
  const index = buildTouchedFileIndex(openPrs);
  return findings.map((finding) => {
    const prs = index.get(finding.file);
    if (!prs || prs.length === 0) return finding;
    return { ...finding, rationale: finding.rationale + overlapNote(finding.file, prs) };
  });
}
