import * as z from 'zod';

import { loadApiConfigBlock } from '../../platform/config/api-config';
import {
  retentionApiConfigShape,
  type RetentionConfig,
} from './retention-api-config';
import { RETENTION_AREA } from './retention-area';

/** How long consent and destruction records are kept before the sweep. */
export const RETENTION = 'RETENTION';

export function loadRetention(): RetentionConfig {
  return loadApiConfigBlock(
    RETENTION_AREA,
    z.object(retentionApiConfigShape).strict(),
  );
}
