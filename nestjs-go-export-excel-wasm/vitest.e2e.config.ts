import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  publicDir: false,
  plugins: [
    swc.vite({
      jsc: {
        parser: {
          syntax: 'typescript',
          decorators: true,
        },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
        target: 'es2023',
      },
      module: {
        type: 'es6',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
