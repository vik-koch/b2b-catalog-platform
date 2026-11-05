import * as z from 'zod';
import { ACCOUNTS_AREA } from '../core/accounts/accounts-area';
import { accountsConfigShape } from '../core/accounts/accounts-config';
import { CATALOG_AREA } from '../core/catalog/catalog-area';
import { catalogConfigShape } from '../core/catalog/catalog-config';
import { orderingConfigShape } from '../core/ordering/order-config';
import { ORDERING_AREA } from '../core/ordering/ordering-area';
import { SITE_AREA } from '../core/site/site-area';
import { siteConfigShape } from '../core/site/site-config';
import { deploymentConfigShape } from '../platform/config/deployment-config';
import type { DeepReadonly } from '../platform/deep-readonly';
import { mergeShapes } from '../platform/merge-shapes';

/** `deployment.json` whole: every area's block, so a missing key or a stray
 * one stops the boot. */
export const deploymentConfigSchema = z
  .object(
    mergeShapes(
      deploymentConfigShape,
      { [SITE_AREA]: z.object(siteConfigShape).strict() },
      { [CATALOG_AREA]: z.object(catalogConfigShape).strict() },
      { [ACCOUNTS_AREA]: z.object(accountsConfigShape).strict() },
      { [ORDERING_AREA]: z.object(orderingConfigShape).strict() },
    ),
  )
  .strict();

export type DeploymentConfigFile = DeepReadonly<
  z.infer<typeof deploymentConfigSchema>
>;
