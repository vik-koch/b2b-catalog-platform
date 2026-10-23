/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/erp-sim',
  test: {
    globals: true,
    cache: {
      dir: '../../node_modules/.vitest/apps/erp-sim',
    },
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
  },
});
