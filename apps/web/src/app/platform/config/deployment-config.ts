import { InjectionToken, Provider } from '@angular/core';
import { DeploymentConfig } from '@b2b-catalog-platform/shared/platform';
import { readShellState } from './shell-state';

export const DEPLOYMENT_CONFIG = new InjectionToken<DeploymentConfig>(
  'DEPLOYMENT_CONFIG',
);

/** In the browser, from the document (see shell-state.ts). */
export function provideDeploymentConfig(): Provider {
  return {
    provide: DEPLOYMENT_CONFIG,
    useFactory: () => readShellState('deploymentConfig'),
  };
}
