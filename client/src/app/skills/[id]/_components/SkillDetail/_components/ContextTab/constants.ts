import type { ContextFolderType } from "@devdigest/shared";

/** Constants for the skill ContextTab (drag-to-reorder + attach/detach). */

/** Minimum drag distance before the sortable activates — prevents accidental
 *  drags when the user just clicks the checkbox or row body. */
export const DRAG_ACTIVATION_DISTANCE = 4;

/** Badge color per discovered-doc folder type. */
export const FOLDER_BADGE_COLOR: Record<ContextFolderType, string> = {
  specs: "var(--accent)",
  docs: "var(--text-secondary)",
  insights: "var(--warn)",
};
