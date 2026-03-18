import swc from 'unplugin-swc';

export const swcVitestPlugin = swc.vite({
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
});
