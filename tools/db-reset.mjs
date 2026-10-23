#!/usr/bin/env node
/**
 * Empties the local database the way infra/seed.sh empties a demo stack's,
 * and the uploaded files with it: a new schema rather than emptied tables,
 * because the migrations write rows of their own. `nx run seeder:seed` runs
 * this first, then migrates, seeds and creates the admin.
 *
 * Local only: it refuses a DATABASE_URL that names another machine, and
 * clears MEDIA_ROOT only when that lies inside the workspace.
 */
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('db-reset: DATABASE_URL is not set');
  process.exit(1);
}
const { hostname } = new URL(url);
if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
  console.error(
    `db-reset: refusing ${hostname} — this resets a database on this machine only`,
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(`
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    DROP SCHEMA IF EXISTS drizzle CASCADE;
  `);
} finally {
  await client.end();
}
console.log(`db-reset: emptied ${new URL(url).pathname.slice(1)}`);

const media = process.env.MEDIA_ROOT;
if (media) {
  const dir = resolve(media);
  const inside = relative(process.cwd(), dir);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) {
    console.warn(`db-reset: left ${dir} alone — it is outside the workspace`);
  } else if (existsSync(dir)) {
    for (const entry of readdirSync(dir)) {
      rmSync(join(dir, entry), { recursive: true, force: true });
    }
    console.log(`db-reset: emptied ${media}`);
  }
}
