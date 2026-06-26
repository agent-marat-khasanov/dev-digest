import { describe, it, expect } from 'vitest';
import { classifyFile } from './classify.js';

/**
 * Unit tests for the deterministic file classifier. The priority order
 * (boilerplate → wiring → core) is the behaviour that actually matters: a
 * regression there silently mis-buckets files in the SmartDiff view.
 */
describe('classifyFile', () => {
  it('classifies lock files as boilerplate even when their extension is a wiring extension', () => {
    // package-lock.json / pnpm-lock.yaml would otherwise match the .json / .yaml wiring rules.
    expect(classifyFile('package-lock.json')).toBe('boilerplate');
    expect(classifyFile('frontend/pnpm-lock.yaml')).toBe('boilerplate');
    expect(classifyFile('go.sum')).toBe('boilerplate');
  });

  it('classifies generated / build-output / minified files as boilerplate', () => {
    expect(classifyFile('dist/app.js')).toBe('boilerplate');
    expect(classifyFile('client/.next/static/chunk.js')).toBe('boilerplate');
    expect(classifyFile('src/styles.min.css')).toBe('boilerplate');
    expect(classifyFile('src/__snapshots__/Foo.test.tsx.snap')).toBe('boilerplate');
    expect(classifyFile('src/api.generated.ts')).toBe('boilerplate');
  });

  it('classifies entry points, configs and CI workflows as wiring', () => {
    expect(classifyFile('src/index.ts')).toBe('wiring');
    expect(classifyFile('server/src/server.ts')).toBe('wiring');
    expect(classifyFile('package.json')).toBe('wiring');
    expect(classifyFile('tsconfig.build.json')).toBe('wiring');
    expect(classifyFile('Dockerfile.prod')).toBe('wiring');
    expect(classifyFile('vite.config.ts')).toBe('wiring');
    expect(classifyFile('docker-compose.yml')).toBe('wiring');
    expect(classifyFile('.github/workflows/ci.ts')).toBe('wiring');
  });

  it('classifies ordinary source files as core (the default)', () => {
    expect(classifyFile('src/modules/intent/service.ts')).toBe('core');
    expect(classifyFile('reviewer-core/src/review/run.ts')).toBe('core');
    expect(classifyFile('README.md')).toBe('core');
  });
});
