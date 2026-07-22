import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

// Mailpit's REST API, published on the host by compose.override.yml. 8026 (not
// the compose.db.yml dev stack's 8025) mirrors the localtest DB's 5433 host
// port, so the smoke-test stack and the dev stack can run side by side.
export const MAILPIT_API = 'http://localhost:8026/api/v1';
