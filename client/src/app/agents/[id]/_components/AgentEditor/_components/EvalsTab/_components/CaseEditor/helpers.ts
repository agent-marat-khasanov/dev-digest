/** Pure helpers for CaseEditor. */
import type { ExpectedFinding } from "@devdigest/shared";

export type DiffLineKind = "meta" | "hunk" | "add" | "text";

/** Classify one line of a pasted unified diff for the colored preview:
    ---/+++ headers muted, @@ hunk header blue, + lines green-tinted. */
export function classifyDiffLine(line: string): DiffLineKind {
  if (line.startsWith("---") || line.startsWith("+++")) return "meta";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  return "text";
}

/** Best-effort JSON parse for the "valid JSON" badge — never throws. */
export function parseJson(text: string): { valid: boolean; value: unknown } {
  try {
    return { valid: true, value: JSON.parse(text) };
  } catch {
    return { valid: false, value: undefined };
  }
}

const FINDING_SKELETON: ExpectedFinding = {
  severity: "WARNING",
  category: "bug",
  title: "",
  file: "",
  start_line: 1,
  end_line: 1,
};

/** Append a template ExpectedFinding to the JSON array text. Starts a fresh
    array when the current text isn't a valid JSON array. */
export function appendFindingSkeleton(text: string): string {
  const { valid, value } = parseJson(text);
  const findings = valid && Array.isArray(value) ? value : [];
  return JSON.stringify([...findings, FINDING_SKELETON], null, 2);
}

/** "1.8s" style duration label, or null when the run has no duration. */
export function formatDurationS(durationMs: number | null | undefined): string | null {
  if (durationMs == null) return null;
  return `${(durationMs / 1000).toFixed(1)}s`;
}
