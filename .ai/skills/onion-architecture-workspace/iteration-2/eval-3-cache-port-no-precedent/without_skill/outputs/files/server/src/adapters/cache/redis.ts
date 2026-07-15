import Redis from 'ioredis';
import type { Cache } from './index.js';

/**
 * Cache over Redis (ioredis). Connection string comes from REDIS_URL.
 *
 * Configured to fail FAST and QUIETLY rather than to be reliable — this is a
 * rate-limit shield, not a source of truth:
 *   - `lazyConnect`: no socket is opened until the first get/set, so a boot with
 *     an unreachable Redis is still a clean boot.
 *   - `commandTimeout` / `connectTimeout`: a hung Redis adds at most ~1s to a
 *     request instead of stalling it behind the GitHub call it was meant to save.
 *   - `maxRetriesPerRequest: 1`: don't pile retries on top of an outage.
 *   - the mandatory `error` listener: ioredis emits connection errors as events,
 *     and an unhandled 'error' event would take the process down. Cache failures
 *     are absorbed here and surface to the caller as a plain miss — the same
 *     silent-degradation contract the depgraph/tokenizer/price-book adapters use.
 */
export class RedisCache implements Cache {
  private redis: Redis;

  constructor(url: string) {
    this.redis = new Redis(url, {
      lazyConnect: true,
      connectTimeout: 2_000,
      commandTimeout: 1_000,
      maxRetriesPerRequest: 1,
    });
    this.redis.on('error', () => {
      /* absorbed: a broken cache must not crash the API (see class doc) */
    });
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } catch {
      /* a write we couldn't make is just a future miss */
    }
  }
}
