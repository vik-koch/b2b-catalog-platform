import { join } from 'node:path';

import { loadSeedBundle } from '@b2b-catalog-platform/seed';

import { workspaceRoot } from './localtest';

/** The committed demo bundle the global setup seeds, for specs that assert
 * against what was seeded. */
export const fixtureSeed = loadSeedBundle(
  join(workspaceRoot, 'deployments/fixture/seed'),
);
