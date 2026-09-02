/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/api',
  plugins: [
    tsconfigPaths(),
    // Not esbuild, which is vitest's default: it strips decorators without
    // emitting the `design:paramtypes` metadata Nest's DI reads to resolve a
    // constructor. Every TestingModule would fail to resolve its providers.
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    globals: true,
    cache: {
      dir: '../../node_modules/.vitest/apps/api',
    },
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/api',
      provider: 'v8',
    },
  },
});
