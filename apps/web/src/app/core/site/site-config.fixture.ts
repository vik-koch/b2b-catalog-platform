import type { DeploymentConfig } from '@b2b-catalog-platform/shared/platform';
import { defaultDeploymentConfig } from '../../platform/config/deployment-config.fixture';
import {
  SITE_AREA,
  type SiteConfig,
} from '@b2b-catalog-platform/shared/core/site';

/** The fixture's deployment config with the site's block changed. */
export function withSite(
  site: Partial<SiteConfig>,
  config: DeploymentConfig = defaultDeploymentConfig,
): DeploymentConfig {
  return { ...config, [SITE_AREA]: { ...config[SITE_AREA], ...site } };
}
