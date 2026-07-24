/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  root: __dirname,
  cacheDir: '../node_modules/.vite/shared',
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    cache: {
      dir: '../node_modules/.vitest/libs/shared',
    },
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../coverage/libs/shared',
      provider: 'v8',
    },
  },
});
