import type { ReviewRecord, Severity } from "@devdigest/shared";

export function lineDomId(path: string, newNo: number): string {
  return `diffline-${path}-${newNo}`;
}

const SEV_ORDER: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

export function highestSeverity(severities: Severity[]): Severity | null {
  for (const sev of SEV_ORDER) {
    if (severities.includes(sev)) return sev;
  }
  return null;
}

/** Build a map of new-side line number → highest severity for findings on that line.
 *  Uses only the latest review (reviews[0]). */
export function findingsByLine(
  reviews: ReviewRecord[],
  path: string
): Map<number, Severity> {
  const map = new Map<number, Severity>();
  const findings = reviews[0]?.findings ?? [];
  for (const f of findings) {
    if (f.file !== path) continue;
    const line = f.start_line;
    const current = map.get(line);
    if (!current) {
      map.set(line, f.severity);
    } else {
      const existingIdx = SEV_ORDER.indexOf(current);
      const incomingIdx = SEV_ORDER.indexOf(f.severity);
      if (incomingIdx < existingIdx) map.set(line, f.severity);
    }
  }
  return map;
}
