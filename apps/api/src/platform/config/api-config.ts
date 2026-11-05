import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { sessionConfigSchema } from '../auth/session-config';
import * as z from 'zod';

/** The keys of `api.json` no area claims: what only the API reads, kept out
 * of `deployment.json`, which every page carries. */
export const apiConfigShape = {
  /** How long a session lasts without use (FR-AUTH-12). */
  session: sessionConfigSchema.optional(),
};

type ApiConfig = z.infer<z.ZodObject<typeof apiConfigShape>>;

let cached: ApiConfig | undefined;
const blocks = new Map<string, unknown>();

/** The keys no area claims. Loose, as each area checks its own block and the
 * root checks the file whole at boot. */
export function loadApiConfig(): ApiConfig {
  return (cached ??= loadConfig(
    z.looseObject(apiConfigShape),
    'api.json',
  ) as ApiConfig);
}

/** An area's block, checked against the area's own schema on first read. */
export function loadApiConfigBlock<T>(area: string, schema: z.ZodType<T>): T {
  if (!blocks.has(area)) {
    const file = loadConfig(z.looseObject({ [area]: schema }), 'api.json');
    blocks.set(area, (file as Record<string, T>)[area]);
  }
  return blocks.get(area) as T;
}
