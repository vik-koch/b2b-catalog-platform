import { inject, Provider, TransferState } from '@angular/core';
import {
  DEPLOYMENT_CONFIG,
  DEPLOYMENT_CONFIG_STATE_KEY,
  defaultDeploymentConfig,
} from './deployment-config';

/**
 * Server provider: writes the deployment config into TransferState so the
 * browser reads it once from the initial HTML instead of over an endpoint.
 * Merged after appConfig, so it wins over the browser provider during SSR.
 *
 * Ships the demo defaults today; a per-deployment override (e.g. a mounted file
 * parsed here, merged over defaultDeploymentConfig) would slot in without
 * rebuilding the published image.
 */
export function provideServerDeploymentConfig(): Provider {
  return {
    provide: DEPLOYMENT_CONFIG,
    useFactory: () => {
      const config = defaultDeploymentConfig;
      inject(TransferState).set(DEPLOYMENT_CONFIG_STATE_KEY, config);
      return config;
    },
  };
}
