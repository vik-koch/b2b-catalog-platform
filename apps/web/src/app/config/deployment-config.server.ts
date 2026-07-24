import { inject, Provider, TransferState } from '@angular/core';
import {
  DEPLOYMENT_CONFIG,
  DEPLOYMENT_CONFIG_STATE_KEY,
} from './deployment-config';
import { deploymentConfigSchema } from './deployment-config.type';
import { loadConfig } from '@b2b-catalog-platform/shared/node';

const CONFIG_ENV_VAR = 'DEPLOYMENT_CONFIG_FILE';

/**
 * Read once per process: the mounted file is immutable for the container's
 * lifetime, so there's no reason to re-read and re-validate on every SSR
 * request. A bad file throws here, at first render, and keeps the stack down.
 *
 * Constructed lazily because the production build imports this module
 * without any runtime environment.
 */
let cachedDeploymentConfig: ReturnType<typeof loadConfig> | undefined;

function getDeploymentConfig() {
  return (cachedDeploymentConfig ??= loadConfig(
    deploymentConfigSchema,
    CONFIG_ENV_VAR,
  ));
}

/**
 * Server provider: writes the deployment config into TransferState so the
 * browser reads it once from the initial HTML instead of over an endpoint.
 * Merged after appConfig, so it wins over the browser provider during SSR.
 */
export function provideServerDeploymentConfig(): Provider {
  return {
    provide: DEPLOYMENT_CONFIG,
    useFactory: () => {
      const deploymentConfig = getDeploymentConfig();
      inject(TransferState).set(DEPLOYMENT_CONFIG_STATE_KEY, deploymentConfig);
      return deploymentConfig;
    },
  };
}
