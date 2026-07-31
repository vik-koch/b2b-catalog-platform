import { seedDatabase } from '@b2b-catalog-platform/seed';
import { execSync } from 'node:child_process';
import { localtestDbClient, localtestEnv, workspaceRoot } from './localtest';

const baseURL = process.env['BASE_URL'] || 'http://localhost:8080';

export default async function globalSetup() {
  const env = localtestEnv();

  // 1. Bring up the smoke-test stack from the real images. compose.yml
  //    expects the shared Traefik network to exist, even though nothing
  //    routes through it locally.
  execSync(
    'docker network inspect traefik >/dev/null 2>&1 || docker network create traefik',
    { cwd: workspaceRoot, stdio: 'inherit' },
  );
  // The stack's api bind-mounts MEDIA_ROOT (compose.override.yml) and writes
  // uploads there as its unprivileged uid-1000 `node` user. Create it
  // world-writable BEFORE `up`, or Docker auto-creates the bind path owned by
  // whoever runs compose — root on CI — and the uid-1000 container can't write
  // uploads (they 500, and the upload spec fails while host-seeded catalog
  // images still load). Must precede `up`; the host seed writes here too.
  execSync(
    `mkdir -p "${env['MEDIA_ROOT']}" && chmod 777 "${env['MEDIA_ROOT']}"`,
    {
      cwd: workspaceRoot,
      stdio: 'inherit',
    },
  );
  // Build the app images from the working tree before starting the stack, so a
  // local run always tests the code in front of you.
  //
  // Every run, not just when an image is missing: the failure this prevents is
  // a *stale* image, not an absent one. config/ is bind-mounted while the
  // schema that validates it is compiled into the image, so changing a config
  // shape without rebuilding leaves a container that rejects the mounted file
  // on boot (load-whole-or-die) and answers every request with a 502. Docker
  // layer caching makes a no-op build ~30s.
  //
  // Skipped on CI, which already builds both images under these tags with its
  // buildx cache (see .github/workflows/ci.yml), and when BASE_URL targets a
  // deployed environment, where the local tree is irrelevant.
  if (!process.env['BASE_URL'] && !process.env['CI']) {
    execSync('docker compose --env-file .env.localtest build web api', {
      cwd: workspaceRoot,
      stdio: 'inherit',
      env: { ...process.env, ...env },
    });
  }
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
  const client = localtestDbClient();
  await client.connect();
  try {
    await seedDatabase(client, env['MEDIA_ROOT']);
    // bootstrap-admin flags its account as still using the password the deploy
    // gave it, so the app forces a change on first sign-in. Clear it here: the
    // login/session specs are about other things and would all have to dismiss
    // the modal. The forced flow gets its own throwaway account and its own
    // spec (change-password.spec.ts), so nothing here has to stay flagged.
    await client.query(
      'UPDATE users SET "mustChangePassword" = false WHERE email = $1',
      [env['ADMIN_EMAIL'].trim().toLowerCase()],
    );
  } finally {
    await client.end();
  }
}
