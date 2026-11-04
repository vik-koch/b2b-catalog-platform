import { loadConfig } from '@b2b-catalog-platform/shared/node';
import {
  DeploymentConfig,
  deploymentConfigSchema,
} from '@b2b-catalog-platform/shared/platform';

/** The fixture's config, for specs to override what they test:
 *
 *   { ...defaultDeploymentConfig, cookieConsentEnabled: true }
 */
export const defaultDeploymentConfig: DeploymentConfig = loadConfig(
  deploymentConfigSchema,
  'deployment.json',
);
