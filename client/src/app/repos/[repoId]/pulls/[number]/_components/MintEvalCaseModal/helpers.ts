export interface DiffLine {
  kind: "add" | "del" | "ctx" | "hunk";
  text: string;
}

/** Splits a raw unified-diff patch string into classified lines for display. */
export function classifyDiffLines(patch: string): DiffLine[] {
  if (!patch) return [];
  return patch.split("\n").map((line) => {
    if (line.startsWith("@@")) return { kind: "hunk", text: line };
    if (line.startsWith("+")) return { kind: "add", text: line };
    if (line.startsWith("-")) return { kind: "del", text: line };
    return { kind: "ctx", text: line };
  });
}
