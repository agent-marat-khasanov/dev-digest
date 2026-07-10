import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { IndexerEdgeRow, IndexerFileFactsRow } from '../src/modules/repo-intel/repository.js';

/**
 * getReachableFacts — the depth-2 reverse-import BFS that answers ТЗ step 3
 * ("which HTTP routes are reachable from the changed files"). We patch the
 * service's repo with a small import graph + per-file facts and assert the walk
 * stops at 2 hops and unions endpoints/crons across the visited files. No DB.
 */

// Import edges (fromFile imports toFile). Dependents chain: D → C → B → A.
const EDGES: IndexerEdgeRow[] = [
  { fromFile: 'src/b.ts', toFile: 'src/a.ts' },
  { fromFile: 'src/c.ts', toFile: 'src/b.ts' },
  { fromFile: 'src/d.ts', toFile: 'src/c.ts' },
];

const FACTS: Record<string, IndexerFileFactsRow> = {
  'src/a.ts': { filePath: 'src/a.ts', endpoints: ['GET /a'], crons: [] },
  'src/b.ts': { filePath: 'src/b.ts', endpoints: ['GET /b'], crons: [] },
  'src/c.ts': { filePath: 'src/c.ts', endpoints: ['GET /c'], crons: ['reset (hourly)'] },
  'src/d.ts': { filePath: 'src/d.ts', endpoints: ['GET /d'], crons: [] },
};

function buildService(flag: boolean): RepoIntelService {
  const svc = new RepoIntelService({ config: { repoIntelEnabled: flag }, db: {} as never } as never);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    getEdges: async (): Promise<IndexerEdgeRow[]> => EDGES,
    getFileFacts: async (_repoId: string, files: string[]): Promise<IndexerFileFactsRow[]> =>
      files.map((f) => FACTS[f]).filter((r): r is IndexerFileFactsRow => Boolean(r)),
  };
  return svc;
}

describe('RepoIntelService.getReachableFacts', () => {
  it('walks dependents up to 2 hops and unions their endpoints/crons', async () => {
    // Seed A: dependents within 2 hops are B (hop 1) and C (hop 2); D (hop 3) is excluded.
    const out = await buildService(true).getReachableFacts('r1', ['src/a.ts'], 2);

    expect(new Set(out['src/a.ts']!.endpoints)).toEqual(new Set(['GET /a', 'GET /b', 'GET /c']));
    expect(out['src/a.ts']!.endpoints).not.toContain('GET /d');
    expect(out['src/a.ts']!.crons).toEqual(['reset (hourly)']);
  });

  it('honours a depth of 1 (direct dependents only)', async () => {
    const out = await buildService(true).getReachableFacts('r1', ['src/a.ts'], 1);
    expect(new Set(out['src/a.ts']!.endpoints)).toEqual(new Set(['GET /a', 'GET /b']));
  });

  it('returns {} when repo-intel is disabled', async () => {
    await expect(buildService(false).getReachableFacts('r1', ['src/a.ts'])).resolves.toEqual({});
  });

  it('returns {} for an empty seed set', async () => {
    await expect(buildService(true).getReachableFacts('r1', [])).resolves.toEqual({});
  });
});
