/**
 * cache adapter — key/value store with TTL, in front of hot external reads.
 *
 * The port lives next to its implementations (same shape as depgraph/tokenizer):
 * it is server-internal infrastructure, not part of the shared contracts, so
 * nothing outside `server/` codes against it.
 *
 * Values are opaque strings; encoding/validation is the caller's job (the PR
 * detail cache stores JSON and re-validates it against the Zod contract on read).
 *
 * HARD RULE — a cache must never fail its caller. Implementations swallow their
 * own transport errors: a miss and an outage look identical from the outside, so
 * a dead Redis degrades to "no cache", never to a broken endpoint.
 */
export interface Cache {
  /** The stored value, or null on a miss (or any cache-side failure). */
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/**
 * Default when REDIS_URL is unset: every read misses, every write is a no-op.
 * The app boots and behaves exactly as it did before the cache existed.
 */
export class NoopCache implements Cache {
  async get(): Promise<string | null> {
    return null;
  }

  async set(): Promise<void> {}
}

export { RedisCache } from './redis.js';
