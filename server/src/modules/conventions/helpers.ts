import type { Convention } from '@devdigest/shared';
import type { ConventionRow } from '../../db/rows.js';

/**
 * Pure helpers for the conventions module — DB row ⇄ DTO mapping and the
 * code-based evidence check. No I/O (the file read happens in the service; this
 * only compares already-read content), so it is trivially unit-testable.
 */

export function toConventionDto(row: ConventionRow): Convention {
  const evidence =
    row.evidencePath !== null
      ? {
          file: row.evidencePath,
          line: row.evidenceLine ?? '',
          code: row.evidenceCode ?? '',
        }
      : null;
  return {
    id: row.id,
    repo_id: row.repoId,
    category: row.category,
    rule: row.rule,
    evidence,
    confidence: row.confidence,
    status: row.status,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** Collapse runs of whitespace and trim — so cosmetic spacing never fails a match. */
function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Code-based evidence validation (no model). A candidate is trustworthy only if
 * its cited code actually appears in the file. We check the claimed line first;
 * if the model is off by a little (a common LLM mistake) we accept a match
 * anywhere in the file rather than discarding a real convention on a line typo.
 *
 * `fileContent` is the full text of the cited file, or `null` when the file does
 * not exist in the clone — in which case the candidate is always rejected.
 */
export function evidenceMatches(
  fileContent: string | null,
  line: string,
  code: string,
): boolean {
  if (fileContent === null) return false;
  const needle = normalize(code);
  if (needle.length === 0) return false;

  const lines = fileContent.split('\n');
  const lineNum = Number.parseInt(line, 10);
  if (Number.isFinite(lineNum) && lineNum >= 1 && lineNum <= lines.length) {
    const claimed = normalize(lines[lineNum - 1] ?? '');
    if (claimed.length > 0 && (claimed.includes(needle) || needle.includes(claimed))) {
      return true;
    }
  }
  // Fall back to a whole-file containment check for small line-number drift.
  return normalize(fileContent).includes(needle);
}
