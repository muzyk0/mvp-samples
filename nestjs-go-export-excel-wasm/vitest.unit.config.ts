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
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
    },
  },
});
