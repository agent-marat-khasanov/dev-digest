import { describe, expect, it } from 'vitest';
import { registerGetBlastRadius } from '../tools/get-blast-radius.js';
import { captureTools, text } from './helpers.js';
import type { DevDigestClient } from '../client.js';

describe('get_blast_radius handler (stub)', () => {
  it('returns the not-implemented notice and makes no API call', async () => {
    let calls = 0;
    const trap = new Proxy(
      { runTimeoutMs: 180_000 },
      {
        get(target, prop) {
          if (prop in target) return (target as Record<string, unknown>)[prop as string];
          return () => {
            calls += 1;
            throw new Error(`unexpected API call: ${String(prop)}`);
          };
        },
      },
    ) as unknown as DevDigestClient;

    const { server, handlers } = captureTools();
    registerGetBlastRadius(server, trap);
    const result = await handlers.get('get_blast_radius')!({ owner: 'acme', repo: 'web', pr_number: 42 });

    expect(result.isError).toBeUndefined();
    expect(text(result)).toMatch(/not yet implemented/i);
    expect(calls).toBe(0);
  });
});
