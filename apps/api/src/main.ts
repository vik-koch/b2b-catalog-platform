import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { runBootstrapAdmin, runSeed } from '@b2b-catalog-platform/seed';
import { AppModule } from './app/app.module';
import { runMigrations } from './db/migrate';
import { hashPassword } from './auth/password-hashing';
import { scheduleMediaPrune } from './media/prune/media-prune-scheduler';
import { env } from './env';

// Let the server settle and serve traffic before the first maintenance sweep.
const PRUNE_STARTUP_DELAY_MS = 60_000;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Populates req.cookies so the auth guard can read the httpOnly session
  // cookie. No secret: the JWT is self-verifying, so cookie signing adds nothing.
  app.use(cookieParser());

  // Behind Traefik (prod), trust the proxy's forwarded client IP so rate
  // limiting keys on the real client, not the proxy. Off by default
  // (0): in dev/e2e there is no proxy and a spoofable X-Forwarded-For must not
  // be trusted. The number is the count of trusted proxy hops (Traefik = 1).
  if (env.TRUST_PROXY_HOPS > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', env.TRUST_PROXY_HOPS);
  }

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = env.API_PORT;

  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );

  // Delete uploaded images no stored content references. Runs in-process
  // on a timer. Grace-windowed, so an upload not yet saved into a body
  // is never swept mid-edit.
  scheduleMediaPrune({
    connectionString: env.DATABASE_URL,
    mediaRoot: env.MEDIA_ROOT as string,
    graceMs: 0, // env.MEDIA_PRUNE_GRACE_HOURS * 60 * 60 * 1000,
    intervalMs: 1000, // env.MEDIA_PRUNE_INTERVAL_HOURS * 60 * 60 * 1000,
    startupDelayMs: 10, //PRUNE_STARTUP_DELAY_MS,
    dryRun: env.MEDIA_PRUNE_DRY_RUN === 'true',
    log: (message) => Logger.log(message, 'MediaPrune'),
  });
}

async function main() {
  // One-shot tool containers (compose.yml) that do their job and exit instead
  // of starting the server:
  //   migrate         — apply pending migrations; api waits on it completing.
  //   seed            — upsert demo content (dev only, runs after migrate).
  //   bootstrap-admin — create the seeded admin if missing (every env).
  if (env.RUN_MODE === 'migrate') {
    await runMigrations();
    Logger.log('Database migrations complete');
    return;
  }

  if (env.RUN_MODE === 'seed') {
    await runSeed(env.DATABASE_URL);
    Logger.log('Database seeding complete');
    return;
  }

  if (env.RUN_MODE === 'bootstrap-admin') {
    const { ADMIN_EMAIL, ADMIN_PASSWORD } = env;
    // env.ts requires these in this mode; this narrows the optional types.
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required');
    }
    // Hash here (inside the app, with the shared argon2 params) and hand only
    // the hash to the DB layer — plaintext never leaves this process.
    const passwordHash = await hashPassword(ADMIN_PASSWORD);
    const created = await runBootstrapAdmin(
      env.DATABASE_URL,
      ADMIN_EMAIL,
      passwordHash,
    );
    Logger.log(
      created
        ? `Admin bootstrap: created ${ADMIN_EMAIL}`
        : `Admin bootstrap: ${ADMIN_EMAIL} already exists, left unchanged`,
    );
    return;
  }

  await bootstrap();
}

main();
