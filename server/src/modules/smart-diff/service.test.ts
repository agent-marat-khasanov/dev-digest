import { describe, it, expect } from 'vitest';
import type { Container } from '../../platform/container.js';
import type { PullRow } from '../reviews/repository.js';
import { NotFoundError } from '../../platform/errors.js';
import { SmartDiffService } from './service.js';

/**
 * Hermetic unit tests for SmartDiffService. The service reads only through
 * container.reviewRepo (a DB port), so we substitute a fake repo and assert the
 * composed SmartDiff: role bucketing, group order/omission, finding-line
 * mapping, and the split suggestion. No Postgres needed.
 */

interface FakeFile {
  path: string;
  additions: number;
  deletions: number;
}
interface FakeFinding {
  file: string;
  startLine: number;
}

function makeContainer(opts: {
  pull?: boolean;
  files?: FakeFile[];
  findings?: FakeFinding[] | null;
}): Container {
  const reviews =
    opts.findings === undefined || opts.findings === null
      ? []
      : [{ review: { id: 'r1' }, findings: opts.findings }];
  return {
    reviewRepo: {
      getPull: async () => (opts.pull === false ? undefined : ({ id: 'pr1' } as PullRow)),
      getPrFiles: async () => opts.files ?? [],
      reviewsForPull: async () => reviews,
    },
  } as unknown as Container;
}

const WS = 'ws1';
const PR = 'pr1';

describe('SmartDiffService.getSmartDiff', () => {
  it('throws NotFoundError when the PR does not exist', async () => {
    const service = new SmartDiffService(makeContainer({ pull: false }));
    await expect(service.getSmartDiff(WS, PR)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns empty groups and a not-too-big split for a PR with no files', async () => {
    const service = new SmartDiffService(makeContainer({ files: [] }));
    const result = await service.getSmartDiff(WS, PR);

    expect(result.groups).toEqual([]);
    expect(result.split_suggestion).toEqual({
      too_big: false,
      total_lines: 0,
      proposed_splits: [],
    });
  });

  it('buckets files by role in core→wiring→boilerplate order and maps finding lines', async () => {
    const service = new SmartDiffService(
      makeContainer({
        files: [
          { path: 'pnpm-lock.yaml', additions: 200, deletions: 0 }, // boilerplate
          { path: 'src/service.ts', additions: 10, deletions: 2 }, // core
          { path: 'src/index.ts', additions: 3, deletions: 0 }, // wiring
        ],
        findings: [
          { file: 'src/service.ts', startLine: 11 },
          { file: 'src/service.ts', startLine: 20 },
        ],
      }),
    );

    const result = await service.getSmartDiff(WS, PR);

    // Groups appear in ROLE_ORDER regardless of file input order.
    expect(result.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);

    const core = result.groups[0]!;
    expect(core.files.map((f) => f.path)).toEqual(['src/service.ts']);
    expect(core.files[0]!.finding_lines).toEqual([11, 20]);

    // Files without findings get an empty finding_lines list.
    const wiring = result.groups[1]!;
    expect(wiring.files[0]!.finding_lines).toEqual([]);

    // proposed_splits mirrors the populated groups, in order, with role labels.
    expect(result.split_suggestion.proposed_splits).toEqual([
      { name: 'Core', files: ['src/service.ts'] },
      { name: 'Wiring', files: ['src/index.ts'] },
      { name: 'Boilerplate', files: ['pnpm-lock.yaml'] },
    ]);
  });

  it('omits empty role groups and reports finding_lines empty when there are no reviews', async () => {
    const service = new SmartDiffService(
      makeContainer({
        files: [{ path: 'src/service.ts', additions: 4, deletions: 1 }], // core only
        findings: null, // no reviews at all
      }),
    );

    const result = await service.getSmartDiff(WS, PR);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.role).toBe('core');
    expect(result.groups[0]!.files[0]!.finding_lines).toEqual([]);
    expect(result.split_suggestion.total_lines).toBe(5);
    expect(result.split_suggestion.too_big).toBe(false);
  });

  it('flags the PR as too big once total changed lines exceed the threshold', async () => {
    const service = new SmartDiffService(
      makeContainer({
        files: [{ path: 'src/service.ts', additions: 480, deletions: 40 }], // 520 > 500
      }),
    );

    const result = await service.getSmartDiff(WS, PR);

    expect(result.split_suggestion.total_lines).toBe(520);
    expect(result.split_suggestion.too_big).toBe(true);
  });
});
