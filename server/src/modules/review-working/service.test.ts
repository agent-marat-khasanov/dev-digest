import { describe, it, expect } from 'vitest';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { ReviewWorkingService } from './service.js';

/**
 * Hermetic unit tests for ReviewWorkingService — the pre-review argument/agent
 * resolution BEFORE the (LLM-backed) engine call. We assert the guards the CLI
 * relies on; the reviewPullRequest engine path is covered by reviewer-core's own
 * tests, so we don't re-drive it here.
 */

const WS = 'ws1';

const VALID_DIFF = [
  'diff --git a/x.ts b/x.ts',
  '--- a/x.ts',
  '+++ b/x.ts',
  '@@ -1 +1,2 @@',
  ' const a = 1;',
  '+const b = 2;',
  '',
].join('\n');

function makeContainer(agents: Array<{ name: string }>): Container {
  return {
    agentsRepo: { listEnabled: async () => agents },
  } as unknown as Container;
}

describe('ReviewWorkingService.review', () => {
  it('rejects a diff with no file changes', async () => {
    const service = new ReviewWorkingService(makeContainer([{ name: 'General' }]));
    await expect(service.review(WS, 'not a diff at all')).rejects.toBeInstanceOf(AppError);
  });

  it('404s when no review agent is enabled', async () => {
    const service = new ReviewWorkingService(makeContainer([]));
    await expect(service.review(WS, VALID_DIFF)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s when the named agent is not found among enabled agents', async () => {
    const service = new ReviewWorkingService(makeContainer([{ name: 'General' }]));
    await expect(service.review(WS, VALID_DIFF, 'Ghost')).rejects.toBeInstanceOf(NotFoundError);
  });
});
