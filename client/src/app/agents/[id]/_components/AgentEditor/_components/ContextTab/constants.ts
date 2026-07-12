import type { ContextFolderType } from "@devdigest/shared";

/** Minimum drag distance before the sortable activates — prevents accidental
 *  drags when the user just clicks the checkbox or row body. */
export const DRAG_ACTIVATION_DISTANCE = 4;

/** Folder-type → badge colour. */
export const FOLDER_COLOR: Record<ContextFolderType, string> = {
  specs: "#3b82f6",
  docs: "#10b981",
  insights: "#8b5cf6",
};
