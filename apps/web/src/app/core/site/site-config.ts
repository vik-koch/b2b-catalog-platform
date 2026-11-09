import { inject, InjectionToken } from '@angular/core';

import {
  SITE_AREA,
  type SiteConfig,
} from '@b2b-catalog-platform/shared/core/site';

import {
  DEPLOYMENT_CONFIG,
  deploymentConfigBlock,
} from '../../platform/config/deployment-config';

export const SITE_CONFIG = new InjectionToken<SiteConfig>('SITE_CONFIG', {
  providedIn: 'root',
  factory: () =>
    deploymentConfigBlock<SiteConfig>(inject(DEPLOYMENT_CONFIG), SITE_AREA),
});
