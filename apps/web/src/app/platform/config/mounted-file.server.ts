import type { ZodType } from 'zod';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import type { DeepReadonly } from '@b2b-catalog-platform/shared/platform';

/**
 * A file of the mounted config, read and checked on the first call and kept
 * for the process: the mount never changes. Lazy, as the production build
 * imports these modules without a runtime environment.
 */
export function mountedFile<T>(
  schema: ZodType<T>,
  file: string,
): () => DeepReadonly<T> {
  let cached: DeepReadonly<T> | undefined;
  return () => (cached ??= loadConfig(schema, file));
}
