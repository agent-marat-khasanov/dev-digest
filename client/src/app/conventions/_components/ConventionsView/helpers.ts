import type { Convention } from "@devdigest/shared";
import { CONFIDENCE_COLORS } from "./constants";

/** Percent (0–100) for a 0..1 confidence; 0 when unknown. */
export function confidencePct(confidence: number | null | undefined): number {
  return Math.round((confidence ?? 0) * 100);
}

export function confidenceColor(pct: number): string {
  if (pct >= 80) return CONFIDENCE_COLORS.high;
  if (pct >= 50) return CONFIDENCE_COLORS.mid;
  return CONFIDENCE_COLORS.low;
}

/** Newest created_at across the set — the "last scan" time. */
export function lastScanAt(conventions: Convention[]): string | null {
  if (conventions.length === 0) return null;
  return conventions.reduce(
    (max, c) => (c.created_at > max ? c.created_at : max),
    conventions[0]!.created_at,
  );
}

/** Compact relative time, e.g. "just now", "5m ago", "2h ago", "3d ago". */
export function timeAgo(iso: string, now: number): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Preview of the skill markdown built from accepted conventions — mirrors the
 * server's `buildSkillBody` so the modal shows what will actually be created.
 */
export function buildSkillBodyPreview(
  skillName: string,
  description: string,
  accepted: Convention[],
): string {
  const intro = `# ${skillName}\n\n${description}. Flag changes that violate any rule below and cite the offending \`file:line\`.`;
  const blocks = accepted.map((c) => {
    const heading = `## ${c.category ?? "convention"}`;
    const evidence = c.evidence
      ? `\n\nDetected in \`${c.evidence.file}:${c.evidence.line}\`:\n\`\`\`\n${c.evidence.code}\n\`\`\``
      : "";
    return `${heading}\n${c.rule}${evidence}`;
  });
  return [intro, ...blocks].join("\n\n");
}
