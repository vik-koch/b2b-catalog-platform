import type { Response } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

export const workspaceRoot = join(__dirname, '../../../..');

// The localtest stack's env values live in .env.localtest (committed, no
// secrets) — parse them here so both the seed connection (global-setup) and the
// specs read exactly what compose interpolates, and can't drift from it.
export function localtestEnv(): Record<string, string> {
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

/**
 * A pg client for the localtest stack's database, on the host port compose
 * publishes. Specs use it to arrange account state the UI cannot reach (there is
 * no user administration yet), and global-setup uses it to seed content.
 */
export function localtestDbClient(): Client {
  const env = localtestEnv();
  return new Client({
    host: '127.0.0.1',
    port: Number(env['DATABASE_PORT']),
    database: env['POSTGRES_DB'],
    user: env['POSTGRES_USER'],
    password: env['POSTGRES_PASSWORD'],
  });
}

// Mailpit's REST API, published on the host by compose.override.yml. 8026 (not
// the compose.db.yml dev stack's 8025) mirrors the localtest DB's 5433 host
// port, so the smoke-test stack and the dev stack can run side by side.
export const MAILPIT_API = 'http://localhost:8026/api/v1';

/**
 * The HTML a navigation actually served.
 *
 * `page.goto` types its response as nullable — it is null only for a
 * navigation that never left the page — so every caller would otherwise carry
 * a non-null assertion. Failing here says which of the two went wrong.
 */
export async function documentOf(response: Response | null): Promise<string> {
  if (!response) throw new Error('the navigation served no document');
  return response.text();
}
