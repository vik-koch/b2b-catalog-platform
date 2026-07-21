import { seedDatabase } from '@b2b-catalog-platform/seed';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const workspaceRoot = join(__dirname, '../../../..');
const baseURL = process.env['BASE_URL'] || 'http://localhost:8080';

// The stack's env values live in .env.localtest (committed, no secrets) —
// parse it here so the seed connection can't drift from what compose uses.
function localtestEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(join(workspaceRoot, '.env.localtest'), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const eq = line.indexOf('=');
        return [line.slice(0, eq), line.slice(eq + 1)];
      }),
  );
}

export default async function globalSetup() {
  const env = localtestEnv();

  // 1. Bring up the smoke-test stack from the real images. compose.yml
  //    expects the shared Traefik network to exist, even though nothing
  //    routes through it locally.
  execSync(
    'docker network inspect traefik >/dev/null 2>&1 || docker network create traefik',
    { cwd: workspaceRoot, stdio: 'inherit' },
  );
  // OS environment beats --env-file in compose interpolation, and Nx loads
  // the workspace .env (dev-stack values, e.g. DATABASE_PORT) into
  // process.env — override with the localtest values so they always win.
  execSync('docker compose --env-file .env.localtest up -d --wait', {
    cwd: workspaceRoot,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });

  // 2. `up --wait` above already ran the one-shot `migrate` service, so the
  //    schema exists. Poll the API through the proxy until it answers. This
  //    runs BEFORE seeding, so a 404 (known route, unseeded DB) already proves
  //    the API is up — only 5xx means the proxy is still waiting for the API.
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const response = await fetch(`${baseURL}/api/pages/about`);
      if (response.status < 500) break;
    } catch {
      // proxy or API not accepting connections yet
    }
    if (Date.now() > deadline) {
      throw new Error(`API at ${baseURL} did not become ready within 60s`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // 3. Seed the data the specs assert against (idempotent).
  const client = new Client({
    host: '127.0.0.1',
    port: Number(env['DATABASE_PORT']),
    database: env['POSTGRES_DB'],
    user: env['POSTGRES_USER'],
    password: env['POSTGRES_PASSWORD'],
  });
  await client.connect();
  try {
    await seedDatabase(client);
  } finally {
    await client.end();
  }
}
