import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { RepoService } from './service.js';

/**
 * Security-focused unit tests for RepoService.readFileContent — the in-app
 * viewer's file reader. The `path` is attacker-controlled (query string), so the
 * key behaviour is: it serves files INSIDE the clone and rejects any path that
 * escapes it. We use a real temp dir as the clone and stub the workspace-scoped
 * repo lookup.
 */

const WS = 'ws1';
const REPO = 'repo1';

let cloneDir: string;

function serviceFor(clonePath: string | null): RepoService {
  const service = new RepoService({ db: {} } as unknown as Container);
  // Swap the DB-backed repo for a stub that returns a workspace-scoped row.
  (service as unknown as { repo: { getById: (ws: string, id: string) => Promise<unknown> } }).repo = {
    getById: async () => (clonePath === undefined ? undefined : { id: REPO, clonePath }),
  };
  return service;
}

beforeAll(async () => {
  cloneDir = await mkdtemp(join(tmpdir(), 'blast-clone-'));
  await mkdir(join(cloneDir, 'src'), { recursive: true });
  await writeFile(join(cloneDir, 'src', 'rate-limit.ts'), 'export const rateLimit = 1;\n', 'utf8');
});

afterAll(async () => {
  await rm(cloneDir, { recursive: true, force: true });
});

describe('RepoService.readFileContent', () => {
  it('reads a file that lives inside the clone', async () => {
    const result = await serviceFor(cloneDir).readFileContent(WS, REPO, 'src/rate-limit.ts');
    expect(result.path).toBe('src/rate-limit.ts');
    expect(result.content).toContain('rateLimit');
  });

  it('rejects a traversal path that escapes the clone root', async () => {
    await expect(
      serviceFor(cloneDir).readFileContent(WS, REPO, '../../../../etc/passwd'),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an absolute path outside the clone', async () => {
    await expect(
      serviceFor(cloneDir).readFileContent(WS, REPO, '/etc/passwd'),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('404s a file that does not exist in the clone', async () => {
    await expect(
      serviceFor(cloneDir).readFileContent(WS, REPO, 'src/nope.ts'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s when the repo has no clone yet', async () => {
    await expect(
      serviceFor(null).readFileContent(WS, REPO, 'src/rate-limit.ts'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
