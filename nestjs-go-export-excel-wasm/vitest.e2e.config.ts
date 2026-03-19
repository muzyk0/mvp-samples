import { defineConfig } from 'vitest/config';
import { swcVitestPlugin } from './vitest.base.config.js';

export default defineConfig({
  publicDir: false,
  plugins: [swcVitestPlugin],
  test: {
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
