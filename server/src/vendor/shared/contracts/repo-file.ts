import { z } from 'zod';

/**
 * Raw source of a single repository file, for the in-app "open caller at line"
 * viewer on the Blast tab. `path` echoes the requested repo-relative path.
 */
export const RepoFileContent = z.object({
  path: z.string(),
  content: z.string(),
});
export type RepoFileContent = z.infer<typeof RepoFileContent>;
