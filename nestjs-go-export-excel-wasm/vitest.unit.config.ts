import { defineConfig } from 'vitest/config';
import { swcVitestPlugin } from './vitest.base.config.js';

export default defineConfig({
  publicDir: false,
  plugins: [swcVitestPlugin],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
    },
  },
});
