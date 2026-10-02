import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Required environment variable ${name} is not set — copy .env.example to .env at the workspace root`,
    );
  }
  return value;
}

const workspaceRoot = fileURLToPath(new URL('../../../..', import.meta.url));

/** A path under the suite's MEDIA_ROOT, which is relative to the workspace
 * root the API runs from. */
export function mediaPath(...segments: string[]): string {
  return resolve(workspaceRoot, requireEnv('MEDIA_ROOT'), ...segments);
}
