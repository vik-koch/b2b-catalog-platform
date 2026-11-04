import { InjectionToken, Provider } from '@angular/core';
import { DeploymentConfig } from '@b2b-catalog-platform/shared/platform';
import { readShellState } from './shell-state';

/** What an area reads through a token of its own is left out here. */
type UnclaimedDeploymentConfig = Omit<
  DeploymentConfig,
  | 'pages'
  | 'consent'
  | 'cookieConsentEnabled'
  | 'locations'
  | 'mapProvider'
  | 'elsewhere'
>;

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

/** An area's part of the deployment config. Typed apart, but the server
 * checks the file whole against every area's shape, so the part is there. */
export function deploymentConfigPart<T>(config: UnclaimedDeploymentConfig): T {
  return config as unknown as T;
}
