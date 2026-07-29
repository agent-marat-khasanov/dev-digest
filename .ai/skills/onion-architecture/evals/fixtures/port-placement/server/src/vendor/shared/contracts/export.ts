import { z } from 'zod'

export const exportSchema = z.object({
  runId: z.string().uuid(),
  repoId: z.string().uuid(),
  findingCount: z.number().int().nonnegative(),
  downloadUrl: z.string(),
})

export type ExportDto = z.infer<typeof exportSchema>
