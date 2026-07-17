import { Logger } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { join } from 'node:path';
import { Pool } from 'pg';
import { env } from '../env';

const MAX_ATTEMPTS = 30;
const RETRY_DELAY_MS = 1000;

/**
 * Applies pending migrations before the app starts serving. The migrations
 * folder is copied next to the bundle at build time (see webpack.config.js).
 * Retries while Postgres is still starting (compose brings both up together).
 */
export async function runMigrations(): Promise<void> {
  const logger = new Logger('Migrations');
  const migrationsFolder = join(__dirname, 'db/migrations');

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
    try {
      await migrate(drizzle(pool), { migrationsFolder });
      logger.log('Database migrations applied');
      return;
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        throw error;
      }
      logger.warn(
        `Migration attempt ${attempt}/${MAX_ATTEMPTS} failed (is Postgres reachable?), retrying in ${RETRY_DELAY_MS}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    } finally {
      await pool.end();
    }
  }
}
