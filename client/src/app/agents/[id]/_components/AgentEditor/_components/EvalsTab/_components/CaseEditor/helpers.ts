/** Pure helpers for CaseEditor. */

/** Best-effort file path extraction from a pasted unified diff, for the
    preview's synthetic `PrFile.path` — falls back to a generic label when
    the pasted text has no recognizable header (e.g. a bare hunk). */
export function extractFilePath(diffText: string): string {
  const plusPlusPlus = diffText.match(/^\+\+\+ b\/(.+)$/m);
  if (plusPlusPlus?.[1]) return plusPlusPlus[1].trim();
  const gitHeader = diffText.match(/^diff --git a\/(.+?) b\/.+$/m);
  if (gitHeader?.[1]) return gitHeader[1].trim();
  return "pasted-diff";
}
