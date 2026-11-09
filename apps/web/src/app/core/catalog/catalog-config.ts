import { inject, InjectionToken } from '@angular/core';

import {
  CATALOG_AREA,
  type CatalogConfig,
} from '@b2b-catalog-platform/shared/core/catalog';

import {
  DEPLOYMENT_CONFIG,
  deploymentConfigBlock,
} from '../../platform/config/deployment-config';

export const CATALOG_CONFIG = new InjectionToken<CatalogConfig>(
  'CATALOG_CONFIG',
  {
    providedIn: 'root',
    factory: () =>
      deploymentConfigBlock<CatalogConfig>(
        inject(DEPLOYMENT_CONFIG),
        CATALOG_AREA,
      ),
  },
);
