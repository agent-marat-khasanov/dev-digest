import type { SmartDiffRole } from '@devdigest/shared';

/** Lines threshold: a PR diff exceeding this total is flagged as too big. */
export const SPLIT_TOO_BIG_LINES = 500;

/**
 * Lock-file basenames — always classified as boilerplate, checked FIRST
 * so a `*-lock.json` never falls through to the `*.json` wiring rule.
 */
export const LOCK_FILE_NAMES: readonly string[] = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'npm-shrinkwrap.json',
  'Cargo.lock',
  'composer.lock',
  'Gemfile.lock',
  'poetry.lock',
  'Pipfile.lock',
  'go.sum',
  'bun.lockb',
];

/**
 * Boilerplate pattern groups (checked after lock-file exact match,
 * before wiring rules).
 */
export const BOILERPLATE_PATTERNS = {
  /** Path segments that mark a file as boilerplate regardless of name.
   *  `migrations` covers generated DB migration SQL (Drizzle's `out` dir). */
  dirSegments: ['dist', 'build', 'out', '.next', '__snapshots__', 'generated', 'vendor', 'migrations'],
  /** Basename suffixes that mark a file as boilerplate. */
  suffixes: ['.min.js', '.min.css', '.snap', '.map'],
  /** Basename substrings that mark a file as boilerplate. */
  containsSubstring: ['.generated.'],
} as const;

/** Wiring pattern groups (checked after boilerplate). */
export const WIRING_PATTERNS = {
  /** Exact basenames that are always wiring files. */
  basenames: ['server.ts', 'app.ts', 'package.json', 'index.ts', 'index.tsx'] as const,
  /**
   * Prefix / optional suffix combos for basename matching.
   * A match requires startsWith(prefix) and, when suffix is present, endsWith(suffix).
   */
  prefixSuffix: [
    { prefix: 'tsconfig', suffix: '.json' },
    { prefix: 'Dockerfile' },
  ] as const,
  /** Basename substrings that mark a file as wiring (e.g. `webpack.config.ts`). */
  containsSubstring: ['.config.'],
  /** Basename suffixes that mark a file as wiring. */
  suffixes: ['.yml', '.yaml'],
  /** Path substring indicating a GitHub Actions workflow file. */
  pathSubstring: ['.github/workflows/'],
} as const;

export const ROLE_ORDER: SmartDiffRole[] = ['core', 'wiring', 'boilerplate'];

export const ROLE_LABEL: Record<SmartDiffRole, string> = {
  core: 'Core',
  wiring: 'Wiring',
  boilerplate: 'Boilerplate',
};

export const ROLE_CAPTION: Record<SmartDiffRole, string> = {
  core: 'Business logic — review carefully',
  wiring: 'Configuration & entry points',
  boilerplate: 'Lock files, generated & dist files',
};
