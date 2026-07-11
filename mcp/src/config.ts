/**
 * Startup configuration, validated with Zod in ONE place.
 *
 * Reading env here (not scattered across modules) means an invalid value — a
 * malformed URL, a non-numeric timeout — fails loudly at boot with a clear
 * message on stderr, instead of surfacing as a confusing error deep inside a
 * request. `loadConfig()` is pure (env in → validated config out) so it is
 * trivially unit-testable.
 */
import { z } from 'zod';

const ConfigSchema = z.object({
  /** Base URL of the DevDigest REST API. Trailing slashes are trimmed. */
  apiUrl: z
    .string()
    .url('DEVDIGEST_API_URL must be a valid URL')
    .default('http://localhost:3001')
    .transform((u) => u.replace(/\/+$/, '')),
  /** Max time `run_agent_on_pull_request` waits for a run to finish (ms). */
  runTimeoutMs: z.coerce
    .number({ invalid_type_error: 'DEVDIGEST_RUN_TIMEOUT_MS must be a number' })
    .int('DEVDIGEST_RUN_TIMEOUT_MS must be an integer')
    .positive('DEVDIGEST_RUN_TIMEOUT_MS must be positive')
    .default(180_000),
});

/** Validated config (output side of the schema — `apiUrl` is already trimmed). */
export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse({
    apiUrl: env.DEVDIGEST_API_URL,
    runTimeoutMs: env.DEVDIGEST_RUN_TIMEOUT_MS,
  });
  if (!result.success) {
    const details = result.error.issues.map((i) => i.message).join('; ');
    throw new Error(`invalid DevDigest MCP config: ${details}`);
  }
  return result.data;
}
