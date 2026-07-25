import { InjectionToken, Provider } from '@angular/core';
import { DeploymentConfig } from './deployment-config.type';
import { readShellState } from './shell-state';

export const DEPLOYMENT_CONFIG = new InjectionToken<DeploymentConfig>(
  'DEPLOYMENT_CONFIG',
);

/**
 * Browser provider: reads the config the server injected into the document (see
 * shell-state.ts). No baked fallback — a missing payload is a bug, surfaced
 * loudly rather than rendered as empty chrome.
 */
export function provideDeploymentConfig(): Provider {
  return {
    provide: DEPLOYMENT_CONFIG,
    useFactory: () => readShellState('deploymentConfig'),
  };
}
