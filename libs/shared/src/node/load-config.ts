import { DeepReadonly } from './deep-readonly';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ZodType } from 'zod';

/**
 * Where a file of the mounted config directory is: `file` is named relative
 * to `CONFIG_PATH`, the one variable that says where the directory is.
 */
export function configPath(file: string): string {
  const dir = process.env['CONFIG_PATH'];
  if (!dir) {
    throw new Error(
      'CONFIG_PATH is not set — it must name the mounted config directory (see deployments/fixture/config/README.md)',
    );
  }
  return join(dir, file);
}

/** Load and validate a file of the mounted config directory. */
export function loadConfig<T>(
  schema: ZodType<T>,
  file: string,
): DeepReadonly<T> {
  return loadConfigFile(schema, configPath(file));
}

/** Load and validate a config file by its path. */
export function loadConfigFile<T>(
  schema: ZodType<T>,
  path: string,
): DeepReadonly<T> {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  // parse() yields the mutable T; expose it through its deep-readonly view. The
  // cast is sound (a value is trivially a read-only view of itself) but needed —
  // TS can't evaluate `T extends … ? …` for an unconstrained generic T.
  return schema.parse(raw) as DeepReadonly<T>;
}
