/** Donut colour palette per finding category. Falls back to a neutral grey
 *  when the server returns a category we don't have a colour for. */
export const CATEGORY_COLOR: Record<string, string> = {
  security: "#ef4444",
  bug: "#f59e0b",
  perf: "#8b5cf6",
  style: "#3b82f6",
  correctness: "#3b82f6",
  clarity: "#a3a3a3",
};

export const CATEGORY_FALLBACK = "#737373";
