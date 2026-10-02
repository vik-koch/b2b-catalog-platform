import { killPort, waitForPortOpen } from '@nx/node/utils';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireEnv } from './env';

// This file runs as ESM under vitest, so there is no __dirname to resolve from.
const workspaceRoot = fileURLToPath(new URL('../../../..', import.meta.url));

export async function setup() {
  console.log('\nSetting up...\n');

  // 0. Create the dir the LocalMediaStore writes uploads to (MEDIA_ROOT from
  // .env.serve-e2e), so the documents spec can read the stored bytes back.
  mkdirSync(resolve(workspaceRoot, requireEnv('MEDIA_ROOT')), {
    recursive: true,
  });

  // 1. Start this suite's own Postgres and Mailpit afresh (compose.api-e2e.yml):
  // recreating them empties the tmpfs database and the inbox, so no state from
  // an earlier run — an area left owned, maintenance left on — leaks into this
  // one. The env carries .env.serve-e2e (see vite.config.ts), and the OS env
  // beats compose's own .env lookup.
  execSync(
    'docker compose -f compose.api-e2e.yml up -d --wait --force-recreate',
    { cwd: workspaceRoot, stdio: 'inherit' },
  );

  // 2. Apply migrations explicitly.
  execSync('node dist/apps/api/main.js', {
    cwd: workspaceRoot,
    stdio: 'inherit',
    env: { ...process.env, RUN_MODE: 'migrate' },
  });

  // 3. Wait for the API started by Nx (e2e dependsOn api:serve-e2e) to listen.
  const host = requireEnv('API_HOST');
  const port = Number(requireEnv('API_PORT'));
  await waitForPortOpen(port, { host });

  // 4. Seed the data the specs assert against, through the real one-shot
  // (idempotent). Running the built bundle rather than importing the seed lib
  // exercises the same container entry point a deployment uses.
  execSync('node dist/apps/api/main.js', {
    cwd: workspaceRoot,
    stdio: 'inherit',
    env: { ...process.env, RUN_MODE: 'seed' },
  });
}

export async function teardown() {
  // The API process is managed by Nx (continuous api:serve-e2e dependency) and
  // the containers stay up for inspecting a failure — nothing to stop here
  // besides making sure the suite's own port is released when the server was
  // started outside of Nx.
  console.log('\nTearing down...\n');
  const port = Number(requireEnv('API_PORT'));
  try {
    await killPort(port);
  } catch {
    // Port already released — fine.
  }
}
