import type { ContextFolderType } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Default root folder names discovery searches (mirrors server `CONTEXT_ROOTS` default). */
export const DEFAULT_CONTEXT_ROOTS = ["specs", "docs", "insights"] as const;

export const FOLDER_TYPE_META: Record<ContextFolderType, { label: string; icon: IconName }> = {
  specs: { label: "specs", icon: "FileText" },
  docs: { label: "docs", icon: "Folder" },
  insights: { label: "insights", icon: "Lightbulb" },
};
