import { z } from 'zod'

const envSchema = z.object({
  DEVDIGEST_API_URL: z.string().url().default('http://localhost:3001'),
  DEVDIGEST_RUN_TIMEOUT_MS: z.coerce.number().int().positive().default(180000),
})

export interface McpConfig {
  apiUrl: string
  runTimeoutMs: number
}

export function loadConfig(): McpConfig {
  const env = envSchema.parse(process.env)
  return {
    apiUrl: env.DEVDIGEST_API_URL.replace(/\/+$/, ''),
    runTimeoutMs: env.DEVDIGEST_RUN_TIMEOUT_MS,
  }
}
