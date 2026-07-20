import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { runSeed } from '@b2b-catalog-platform/seed';
import { AppModule } from './app/app.module';
import { runMigrations } from './db/migrate';
import { env } from './env';

async function bootstrap() {
  // Idempotent: in the deploy stack the `migrate` one-shot has already applied
  // everything before this container starts, so this is a no-op there. It does
  // the real work for local `nx serve` and the e2e harnesses, which boot the
  // API with no separate migrate step.
  await runMigrations();

  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = env.API_PORT;

  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

async function main() {
  // One-shot tool containers (compose.yml) that do their job and exit instead
  // of starting the server:
  //   migrate — apply pending migrations; api waits on it completing.
  //   seed    — upsert seed data (runs after migrate in the deploy pipeline).
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

  await bootstrap();
}

main();
