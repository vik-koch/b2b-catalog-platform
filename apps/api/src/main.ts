import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';

import { SYNC_MAX_BODY_BYTES } from '@b2b-catalog-platform/shared/core/exchange';

import { runBootstrapAdmin } from './admin/accounts/bootstrap-admin';
import { checkConfigFiles } from './app/app.config-files';
import { MEDIA_REFERENCES } from './app/app.media-references';
import { AppModule } from './app/app.module';
import { hashPassword } from './core/accounts/password-hashing';
import { RetentionSweep } from './core/retention/retention-sweep';
import { MACHINE_SYNC_RUNS_PATHS } from './machine/exchange/machine-sync-body-paths';
import { runMigrations } from './platform/db/migrate';
import { env } from './platform/env';
import { scheduleMediaPrune } from './platform/media/prune/media-prune-scheduler';

// Let the server settle and serve traffic before the first maintenance sweep.
const PRUNE_STARTUP_DELAY_MS = 60_000;

/** Deployed, logs are JSON without colour: Loki reads them, and ANSI codes in
 * a stored line defeat LogQL. Locally (`nx serve`, no NODE_ENV) the readable
 * format stays. */
function logger(): ConsoleLogger {
  const deployed = process.env['NODE_ENV'] === 'production';
  return new ConsoleLogger({ colors: !deployed, json: deployed });
}

async function bootstrap() {
  checkConfigFiles();
  // Nest's own body parser is declined so that a bigger one can be mounted
  // ahead of it. A catalog of tens of thousands of rows is megabytes of JSON
  // and the default ceiling is 100 kB, but raising that globally would widen
  // every endpoint in the API to the same limit, so the large parser is
  // mounted on the paths that need it and everything else keeps the
  // default. body-parser marks a request it has already read, so the general
  // parser below leaves those alone.
  const app = await NestFactory.create(AppModule, {
    logger: logger(),
    bodyParser: false,
  });
  app.use(MACHINE_SYNC_RUNS_PATHS, json({ limit: SYNC_MAX_BODY_BYTES }));
  app.use(json());
  app.use(urlencoded({ extended: true }));

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
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  // So queued mail is flushed on SIGTERM rather than dying with the container
  // when a deploy replaces it (MailDispatcher).
  app.enableShutdownHooks();

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
    sources: MEDIA_REFERENCES,
    mediaRoot: env.MEDIA_ROOT as string,
    graceMs: env.MEDIA_PRUNE_GRACE_HOURS * 60 * 60 * 1000,
    intervalMs: env.MEDIA_PRUNE_INTERVAL_HOURS * 60 * 60 * 1000,
    startupDelayMs: PRUNE_STARTUP_DELAY_MS,
    dryRun: env.MEDIA_PRUNE_DRY_RUN === 'true',
    log: (message) => Logger.log(message, 'MediaPrune'),
  });

  // Delete consent and destruction records whose retention has ended
  // (NFR-LEGAL-09/12). Daily: a period counted in days needs nothing finer.
  app.get(RetentionSweep).schedule(24 * 60 * 60 * 1000, PRUNE_STARTUP_DELAY_MS);
}

async function main() {
  // The one-shot modes below log without an app instance, so the global logger
  // needs the same treatment as the server's.
  Logger.overrideLogger(logger());

  // One-shot tool containers (compose.yml) that do their job and exit instead
  // of starting the server:
  //   migrate:         apply pending migrations; api waits for it.
  //   bootstrap-admin: create the first admin if missing (every env).
  if (env.RUN_MODE === 'migrate') {
    await runMigrations();
    Logger.log('Database migrations complete');
    return;
  }

  if (env.RUN_MODE === 'bootstrap-admin') {
    const { ADMIN_EMAIL, ADMIN_PASSWORD } = env;
    // env.ts requires these in this mode; this narrows the optional types.
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required');
    }
    // Hashed here, with the shared argon2 params: the plaintext never leaves
    // this process.
    const passwordHash = await hashPassword(ADMIN_PASSWORD);
    const created = await runBootstrapAdmin(
      env.DATABASE_URL,
      ADMIN_EMAIL,
      passwordHash,
      env.ADMIN_FORCE_PASSWORD_CHANGE === 'true',
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
