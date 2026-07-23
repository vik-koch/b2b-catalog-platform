import { DeepReadonly } from './deep-readonly';
import { readFileSync } from 'node:fs';
import { ZodType } from 'zod';

/**
 * Load and validate a config file from a mounted JSON file with `envVar` name.
 */
export function loadConfig<T>(
  schema: ZodType<T>,
  envVar: string,
): DeepReadonly<T> {
  const path = process.env[envVar];
  if (!path) {
    throw new Error(
      `${envVar} is not set — it must name a mounted config file (see config/README.md)`,
    );
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  // parse() yields the mutable T; expose it through its deep-readonly view. The
  // cast is sound (a value is trivially a read-only view of itself) but needed —
  // TS can't evaluate `T extends … ? …` for an unconstrained generic T.
  return schema.parse(raw) as DeepReadonly<T>;
}
