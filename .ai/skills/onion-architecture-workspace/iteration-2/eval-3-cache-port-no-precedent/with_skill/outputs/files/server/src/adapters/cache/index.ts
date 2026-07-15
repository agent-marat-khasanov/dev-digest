/**
 * cache adapter — TTL key/value cache placed in front of expensive external reads.
 *
 * PORT + ADAPTER LIVE TOGETHER because the port is SERVER-LOCAL: nothing outside
 * `server/` names `Cache` (only the composition root and the adapters it wires
 * do), so it does NOT belong in `vendor/shared` — that module is hand-synced into
 * `client/` and imported by `reviewer-core`, and parking a server-only port there
 * widens a shared surface for nothing. Same call as `Tokenizer`
 * (adapters/tokenizer/index.ts). It is still a port: resolved from the Container
 * and swappable via `ContainerOverrides.cache`.
 *
 * CONTRACT: the cache is a best-effort accelerator, never a source of truth.
 * An unreachable/wedged Redis MUST degrade to a cache miss, never fail the
 * caller — so `get`/`set` swallow transport errors instead of throwing.
 *
 * Values are opaque strings: serialization (and re-validating what comes back)
 * is the caller's job, which keeps this port a dumb KV store with no knowledge
 * of GitHub, PRs, or any other domain shape.
 */
import Redis from 'ioredis';

export interface Cache {
  /** The value, or null on a miss OR any cache failure. */
  get(key: string): Promise<string | null>;
  /** Store with an expiry. Failures are swallowed — a lost write is just a later miss. */
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Release the connection (called from the Container on app shutdown). */
  close(): Promise<void>;
}

export class RedisCache implements Cache {
  private readonly client: Redis;

  constructor(url: string) {
    this.client = new Redis(url, {
      // No socket is opened until the first get/set — an app that never touches
      // GitHub never connects.
      lazyConnect: true,
      // A wedged Redis must not stall an API request: fail fast, then miss.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    // ioredis emits 'error' on every failed (re)connect; with no listener Node
    // turns that into an unhandled error event and kills the process. Degrading
    // to a miss is the whole point of this adapter, so absorb them here.
    this.client.on('error', () => {});
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } catch {
      /* fire-and-forget: a failed write only costs a future miss */
    }
  }

  async close(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
