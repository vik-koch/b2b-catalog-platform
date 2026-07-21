import { waitForPortOpen } from '@nx/node/utils';
// Relative import: jest resolves globalSetup outside its module resolver,
// so the workspace path alias is not available here (it is in the specs).
// eslint-disable-next-line @nx/enforce-module-boundaries
import { seedDatabase } from '../../../../libs/seed/src/index';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { Client } from 'pg';
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

  // 4. Seed the data the specs assert against (idempotent).
  const client = new Client({ connectionString: requireEnv('DATABASE_URL') });
  await client.connect();
  try {
    await seedDatabase(client);
  } finally {
    await client.end();
  }

  // Hint: Use `globalThis` to pass variables to global teardown.
  globalThis.__TEARDOWN_MESSAGE__ = '\nTearing down...\n';
};
