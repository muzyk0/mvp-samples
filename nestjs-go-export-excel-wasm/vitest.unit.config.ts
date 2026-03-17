import { defineConfig } from 'vitest/config';

export default defineConfig({
  publicDir: false,
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
    },
  },
});
