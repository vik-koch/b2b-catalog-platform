/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/api-e2e',
  // No SWC plugin here, unlike the unit tests: nothing in these specs is a Nest
  // class, so there is no decorator metadata to preserve. They are HTTP clients.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    cache: {
      dir: '../../node_modules/.vitest/apps/api-e2e',
    },
    environment: 'node',
    globalSetup: ['./src/support/global-setup.ts'],
    setupFiles: ['./src/support/test-setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    // Vitest's 5s default is a unit-test budget. These specs are HTTP round
    // trips against a real API, Postgres and SMTP, and the auth-heavy ones
    // deliberately hash passwords with argon2 — so on a machine with enough
    // cores to run many workers at once, they queue behind each other on one
    // API process and blow a 5s deadline while being perfectly correct. Slow is
    // not wrong here; a test that genuinely hangs still fails, just later.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      reportsDirectory: '../../coverage/api-e2e',
      provider: 'v8',
    },
  },
});
