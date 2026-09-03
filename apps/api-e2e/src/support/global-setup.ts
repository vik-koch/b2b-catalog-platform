import { killPort, waitForPortOpen } from '@nx/node/utils';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireEnv } from './env';

// This file runs as ESM under vitest, so there is no __dirname to resolve from.
const workspaceRoot = fileURLToPath(new URL('../../../..', import.meta.url));

export async function setup() {
  console.log('\nSetting up...\n');

  // 0. Create the media dir the LocalMediaStore writes to (MEDIA_ROOT=./.media)
  // before compose runs. The compose.db.yml `media` service bind-mounts it, and
  // if it does not exist yet the Docker daemon creates it root-owned — leaving
  // the nx-served api (this user) unable to write uploads (EACCES). Creating it
  // here first means Docker reuses the dir with this user's ownership.
  mkdirSync(join(workspaceRoot, '.media'), { recursive: true });

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
  // exercises the same container entry point a deployment uses.
  execSync('node dist/apps/api/main.js', {
    cwd: workspaceRoot,
    stdio: 'inherit',
    env: { ...process.env, RUN_MODE: 'seed' },
  });
}

export async function teardown() {
  // The API process is managed by Nx (continuous api:serve dependency) and the
  // Postgres container stays up for local development — nothing to stop here
  // besides making sure the port is released when the server was started
  // outside of Nx.
  console.log('\nTearing down...\n');
  const port = Number(requireEnv('API_PORT'));
  try {
    await killPort(port);
  } catch {
    // Port already released — fine.
  }
}
