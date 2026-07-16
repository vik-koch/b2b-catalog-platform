import { waitForPortOpen } from '@nx/node/utils';
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
  execSync('docker compose -f docker-compose.dev.yml up -d --wait', {
    cwd: workspaceRoot,
    stdio: 'inherit',
  });

  // 2. Apply pending migrations (drizzle-kit reads DATABASE_URL, which Nx
  //    already loaded from the root .env).
  execSync('npx drizzle-kit migrate', {
    cwd: join(workspaceRoot, 'apps/api'),
    stdio: 'inherit',
  });

  // 3. Seed the data the specs assert against (idempotent).
  const client = new Client({ connectionString: requireEnv('DATABASE_URL') });
  await client.connect();
  try {
    await client.query('DELETE FROM "helloWorld"');
    await client.query('INSERT INTO "helloWorld" (message) VALUES ($1)', [
      'Hello API',
    ]);
  } finally {
    await client.end();
  }

  // 4. Wait for the API started by Nx (e2e dependsOn api:serve) to listen.
  const host = requireEnv('API_HOST');
  const port = Number(requireEnv('API_PORT'));
  await waitForPortOpen(port, { host });

  // Hint: Use `globalThis` to pass variables to global teardown.
  globalThis.__TEARDOWN_MESSAGE__ = '\nTearing down...\n';
};