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
      ],
    },
  },
});
