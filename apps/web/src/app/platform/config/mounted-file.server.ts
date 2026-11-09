import * as z from 'zod';

import { loadConfig } from '@b2b-catalog-platform/shared/node';
import type { DeepReadonly } from '@b2b-catalog-platform/shared/platform';

/**
 * A file of the mounted config, read and checked on the first call and kept
 * for the process: the mount never changes. Lazy, as the production build
 * imports these modules without a runtime environment.
 */
export function mountedFile<T>(
  schema: z.ZodType<T>,
  file: string,
): () => DeepReadonly<T> {
  let cached: DeepReadonly<T> | undefined;
  return () => (cached ??= loadConfig(schema, file));
}

/** An area's block of a mounted file, checked against the area's own schema
 * alone: the root checks the file whole at boot. */
export function mountedBlock<T>(
  file: string,
  area: string,
  schema: z.ZodType<T>,
): () => DeepReadonly<T> {
  const whole = mountedFile(z.looseObject({ [area]: schema }), file);
  return () => (whole() as Record<string, DeepReadonly<T>>)[area];
}
