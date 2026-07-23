import {
  inject,
  InjectionToken,
  makeStateKey,
  Provider,
  TransferState,
} from '@angular/core';
import { DeploymentConfig } from './deployment-config.type';

export const DEPLOYMENT_CONFIG = new InjectionToken<DeploymentConfig>(
  'DEPLOYMENT_CONFIG',
);

export const DEPLOYMENT_CONFIG_STATE_KEY =
  makeStateKey<DeploymentConfig>('deploymentConfig');

/**
 * Browser provider: reads the text the server serialized into the HTML. No
 * baked fallback. SSR always writes the state, so a missing key is a bug,
 * surfaced loudly rather than rendered as empty chrome.
 */
export function provideDeploymentConfig(): Provider {
  return {
    provide: DEPLOYMENT_CONFIG,
    useFactory: () => {
      const state = inject(TransferState);
      if (!state.hasKey(DEPLOYMENT_CONFIG_STATE_KEY)) {
        throw new Error('DeploymentConfig missing from TransferState');
      }
      return state.get(DEPLOYMENT_CONFIG_STATE_KEY, null as never);
    },
  };
}
