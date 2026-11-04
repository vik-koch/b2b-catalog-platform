import { inject, InjectionToken } from '@angular/core';
import type { SiteConfig } from '@b2b-catalog-platform/shared/core/site';
import {
  DEPLOYMENT_CONFIG,
  deploymentConfigPart,
} from '../../platform/config/deployment-config';

export const SITE_CONFIG = new InjectionToken<SiteConfig>('SITE_CONFIG', {
  providedIn: 'root',
  factory: () => deploymentConfigPart<SiteConfig>(inject(DEPLOYMENT_CONFIG)),
});
