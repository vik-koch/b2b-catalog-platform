import { loadConfig } from '@b2b-catalog-platform/shared/node';
import {
  DeploymentConfig,
  deploymentConfigSchema,
} from './deployment-config.type';

/**
 * Complete, schema-shaped demo deployment config for tests only — the sibling
 * of `app-text.fixture`, loaded from the same committed file the app serves at
 * runtime via the normal `DEPLOYMENT_CONFIG_FILE` env var.
 *
 * Specs that used to hand-build a config literal drifted every time the schema
 * grew a required field. Start from this and override the one or two values the
 * test is actually about:
 *
 *   { ...defaultDeploymentConfig, cookieConsentEnabled: true }
 */
export const defaultDeploymentConfig: DeploymentConfig = loadConfig(
  deploymentConfigSchema,
  'DEPLOYMENT_CONFIG_FILE',
);
