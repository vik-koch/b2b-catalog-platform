import type { DeploymentConfigFile } from '@b2b-catalog-platform/shared/deployment';
import { defaultDeploymentConfig } from '../../platform/config/deployment-config.fixture';
import {
  SITE_AREA,
  type SiteConfig,
} from '@b2b-catalog-platform/shared/core/site';

/** The fixture's deployment config with the site's block changed. */
export function withSite(
  site: Partial<SiteConfig>,
  config: DeploymentConfigFile = defaultDeploymentConfig,
): DeploymentConfigFile {
  return { ...config, [SITE_AREA]: { ...config[SITE_AREA], ...site } };
}
