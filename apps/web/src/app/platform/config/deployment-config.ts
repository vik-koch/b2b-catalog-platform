import { InjectionToken, Provider } from '@angular/core';
import { DeploymentConfig } from '@b2b-catalog-platform/shared/platform';
import { readShellState } from './shell-state';

/** An area's block is read through the area's own token. */
type UnclaimedDeploymentConfig = Omit<DeploymentConfig, 'site' | 'catalog'>;

export const DEPLOYMENT_CONFIG = new InjectionToken<UnclaimedDeploymentConfig>(
  'DEPLOYMENT_CONFIG',
);

/** In the browser, from the document (see shell-state.ts). */
export function provideDeploymentConfig(): Provider {
  return {
    provide: DEPLOYMENT_CONFIG,
    useFactory: () => readShellState('deploymentConfig'),
  };
}

/** An area's block of the deployment config. Typed apart, but the server
 * checks the file whole against every area's shape, so the block is there. */
export function deploymentConfigBlock<T>(
  config: UnclaimedDeploymentConfig,
  area: string,
): T {
  return (config as unknown as Record<string, T>)[area];
}
