import { inject, InjectionToken } from '@angular/core';

import {
  ACCOUNTS_AREA,
  type AccountsConfig,
} from '@b2b-catalog-platform/shared/core/accounts';

import {
  DEPLOYMENT_CONFIG,
  deploymentConfigBlock,
} from '../../platform/config/deployment-config';

export const ACCOUNTS_CONFIG = new InjectionToken<AccountsConfig>(
  'ACCOUNTS_CONFIG',
  {
    providedIn: 'root',
    factory: () =>
      deploymentConfigBlock<AccountsConfig>(
        inject(DEPLOYMENT_CONFIG),
        ACCOUNTS_AREA,
      ),
  },
);
