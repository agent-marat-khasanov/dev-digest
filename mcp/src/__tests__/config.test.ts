import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';

describe('loadConfig', () => {
  it('applies defaults when nothing is set', () => {
    expect(loadConfig({})).toEqual({
      apiUrl: 'http://localhost:3001',
      runTimeoutMs: 180_000,
    });
  });

  it('reads env, trims a trailing slash, and coerces the timeout to a number', () => {
    expect(
      loadConfig({ DEVDIGEST_API_URL: 'http://api.local:9000/', DEVDIGEST_RUN_TIMEOUT_MS: '5000' }),
    ).toEqual({ apiUrl: 'http://api.local:9000', runTimeoutMs: 5000 });
  });

  it('throws an actionable error on a malformed URL', () => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'not-a-url' })).toThrow(
      /DEVDIGEST_API_URL must be a valid URL/,
    );
  });

  it('throws on a non-numeric or non-positive timeout', () => {
    expect(() => loadConfig({ DEVDIGEST_RUN_TIMEOUT_MS: 'abc' })).toThrow(/DEVDIGEST_RUN_TIMEOUT_MS/);
    expect(() => loadConfig({ DEVDIGEST_RUN_TIMEOUT_MS: '-1' })).toThrow(
      /DEVDIGEST_RUN_TIMEOUT_MS must be positive/,
    );
  });
});
