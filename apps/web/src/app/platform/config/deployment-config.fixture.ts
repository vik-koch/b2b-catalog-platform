import {
  DeploymentConfigFile,
  deploymentConfigSchema,
} from '@b2b-catalog-platform/shared/deployment';
import { loadConfig } from '@b2b-catalog-platform/shared/node';

/** The fixture's config whole, for specs to override what they test:
 *
 *   { ...defaultDeploymentConfig, notice }
 */
export const defaultDeploymentConfig: DeploymentConfigFile = loadConfig(
  deploymentConfigSchema,
  'deployment.json',
);
