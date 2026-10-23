import { loadSeedBundle } from '@b2b-catalog-platform/seed';
import { fileURLToPath } from 'node:url';

/** The committed demo bundle the global setup seeds, for specs that assert
 * against what was seeded. */
export const fixtureSeed = loadSeedBundle(
  fileURLToPath(
    new URL('../../../../deployments/fixture/seed', import.meta.url),
  ),
);
