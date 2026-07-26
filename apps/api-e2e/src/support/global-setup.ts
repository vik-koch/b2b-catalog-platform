import { waitForPortOpen } from '@nx/node/utils';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { requireEnv } from './env';

/* eslint-disable */
var __TEARDOWN_MESSAGE__: string;

const workspaceRoot = join(__dirname, '../../../..');

module.exports = async function () {
  console.log('\nSetting up...\n');

  // 1. Ensure the dev Postgres container is up and healthy.
  execSync('docker compose -f compose.db.yml up -d --wait', {
    cwd: workspaceRoot,
    stdio: 'inherit',
  });

  // 2. Apply migrations explicitly.
  execSync('node dist/apps/api/main.js', {
    cwd: workspaceRoot,
    stdio: 'inherit',
    env: { ...process.env, RUN_MODE: 'migrate' },
  });

  // 3. Wait for the API started by Nx (e2e dependsOn api:serve) to listen.
  const host = requireEnv('API_HOST');
  const port = Number(requireEnv('API_PORT'));
  await waitForPortOpen(port, { host });

  // 4. Seed the data the specs assert against, through the real one-shot
  // (idempotent). Running the built bundle rather than importing the seed lib
  // is deliberate: jest resolves globalSetup outside its module resolver, so
  // workspace path aliases are unavailable here — and this exercises the same
  // container entry point a deployment uses.
  execSync('node dist/apps/api/main.js', {
    cwd: workspaceRoot,
    stdio: 'inherit',
    env: { ...process.env, RUN_MODE: 'seed' },
  });

  // Hint: Use `globalThis` to pass variables to global teardown.
  globalThis.__TEARDOWN_MESSAGE__ = '\nTearing down...\n';
};
