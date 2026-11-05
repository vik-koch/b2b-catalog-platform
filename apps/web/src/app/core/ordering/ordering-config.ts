import { inject, InjectionToken } from '@angular/core';
import {
  ORDERING_AREA,
  type OrderingConfig,
} from '@b2b-catalog-platform/shared/core/ordering';
import {
  DEPLOYMENT_CONFIG,
  deploymentConfigBlock,
} from '../../platform/config/deployment-config';

export const ORDERING_CONFIG = new InjectionToken<OrderingConfig>(
  'ORDERING_CONFIG',
  {
    providedIn: 'root',
    factory: () =>
      deploymentConfigBlock<OrderingConfig>(
        inject(DEPLOYMENT_CONFIG),
        ORDERING_AREA,
      ),
  },
);
