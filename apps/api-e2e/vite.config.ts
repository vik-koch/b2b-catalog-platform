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
    // One file at a time. These specs share one API process and one database,
    // and two of the things under test are *global* runtime settings —
    // maintenance mode and external data ownership (FR-ADM-10). A spec that
    // hands the catalog over changes the answer for every catalog write in
    // every other file, so the suite cannot both exercise those switches and
    // run its files at once.
    //
    // The alternative was to keep the switches untested end to end, as the
    // maintenance gate is (see settings.spec.ts). That was defensible while
    // "on" was a state nothing needed; it is not once the machine sync route
    // only works while the catalog *is* owned. Serial is the honest cost of
    // testing what the release actually does.
    fileParallelism: false,
    coverage: {
      reportsDirectory: '../../coverage/api-e2e',
      provider: 'v8',
    },
  },
});
