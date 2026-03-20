import { defineConfig } from 'vitest/config';
import { swcVitestPlugin } from './vitest.base.config.js';

export default defineConfig({
  publicDir: false,
  plugins: [swcVitestPlugin],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'scripts/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.ts', 'scripts/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'scripts/**/*.spec.ts',
        'src/main.ts',
        'src/export/interfaces/**',
        'scripts/benchmarks/build-site.ts',
        'scripts/benchmarks/collect-benchmark-results.ts',
        'scripts/benchmarks/lib/benchmark-runner.ts',
        'scripts/benchmarks/lib/environment-metadata.ts',
        'scripts/benchmarks/import-recorded-run.ts',
        'scripts/benchmarks/publish-pages.ts',
        'scripts/benchmarks/lib/process-control.ts',
        'scripts/benchmarks/update-history.ts',
        'scripts/benchmarks/validate-benchmarks.ts',
      ],
    },
  },
});
