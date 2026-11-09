import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ZodType } from 'zod';

import type { DeepReadonly } from '../platform/deep-readonly';

/** A file of the mounted config directory, which `CONFIG_PATH` names. */
export function configPath(file: string): string {
  const dir = process.env['CONFIG_PATH'];
  if (!dir) {
    throw new Error(
      'CONFIG_PATH is not set — it must name the mounted config directory (see deployments/fixture/config/README.md)',
    );
  }
  return join(dir, file);
}

export function loadConfig<T>(
  schema: ZodType<T>,
  file: string,
): DeepReadonly<T> {
  return loadConfigFile(schema, configPath(file));
}

export function loadConfigFile<T>(
  schema: ZodType<T>,
  path: string,
): DeepReadonly<T> {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  // Sound, but TS cannot evaluate DeepReadonly for an unconstrained T.
  return schema.parse(raw) as DeepReadonly<T>;
}
