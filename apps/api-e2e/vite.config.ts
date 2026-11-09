/// <reference types='vitest' />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

// The suite's own stack (ports, database, inbox, media dir) is the one Nx
// hands `api:serve-e2e`. Nx loads only `.env` for this target, so the same file
// is laid over it here, before the global setup and workers read process.env.
const e2eStack = parseEnv(
  readFileSync(join(__dirname, '../../.env.serve-e2e'), 'utf8'),
);
Object.assign(process.env, e2eStack);

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
    env: e2eStack,
    globalSetup: ['./src/support/global-setup.ts'],
    setupFiles: ['./src/support/test-setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    // Vitest's 5s default is a unit budget. These are round trips to a real
    // API, Postgres and SMTP, hashing with argon2, queued on one API process: a
    // hang still fails, later.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // One file at a time: the specs share one API and database, and global
    // settings are under test (maintenance, ownership, FR-ADM-10). Handing the
    // catalogue over changes every other file's writes, and the machine routes
    // work only while an area is owned.
    fileParallelism: false,
    coverage: {
      reportsDirectory: '../../coverage/api-e2e',
      provider: 'v8',
    },
  },
});
