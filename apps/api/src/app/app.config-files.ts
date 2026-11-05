import * as z from 'zod';
import { EXCHANGE_AREA } from '@b2b-catalog-platform/shared/core/exchange';
import { ORDERING_AREA } from '@b2b-catalog-platform/shared/core/ordering';
import { deploymentConfigSchema } from '@b2b-catalog-platform/shared/deployment';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { mergeShapes } from '@b2b-catalog-platform/shared/platform';
import { exchangeApiConfigShape } from '../core/exchange/exchange-api-config';
import { orderingApiConfigShape } from '../core/ordering/ordering-api-config';
import { retentionApiConfigShape } from '../core/retention/retention-api-config';
import { RETENTION_AREA } from '../core/retention/retention-area';
import { apiConfigShape } from '../platform/config/api-config';

// Zod only, so the tools that check a deployment can load these as well.

/** `api.json` whole: every area's block, so a stray key stops the boot. */
export const apiConfigSchema = z
  .object(
    mergeShapes(apiConfigShape, {
      [ORDERING_AREA]: z.object(orderingApiConfigShape).strict(),
      [EXCHANGE_AREA]: z.object(exchangeApiConfigShape).strict().optional(),
      [RETENTION_AREA]: z.object(retentionApiConfigShape).strict(),
    }),
  )
  .strict();

/** Before anything reads them: each owner checks only its own keys, so a key
 * no one claims is caught here alone. */
export function checkConfigFiles(): void {
  loadConfig(deploymentConfigSchema, 'deployment.json');
  loadConfig(apiConfigSchema, 'api.json');
}
