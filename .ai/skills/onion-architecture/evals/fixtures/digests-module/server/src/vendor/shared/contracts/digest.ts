import { z } from 'zod'

export const digestTopFileSchema = z.object({
  file: z.string(),
  count: z.number().int().nonnegative(),
})

export const digestSchema = z.object({
  totalRuns: z.number().int().nonnegative(),
  totalFindings: z.number().int().nonnegative(),
  bySeverity: z.record(z.string(), z.number().int().nonnegative()),
  topFiles: z.array(digestTopFileSchema),
  generatedAt: z.string().datetime(),
})

export type DigestDto = z.infer<typeof digestSchema>
