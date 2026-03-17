import { defineConfig } from 'vitest/config';

export default defineConfig({
  publicDir: false,
  test: {
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
