import {
  inject,
  InjectionToken,
  makeStateKey,
  Provider,
  TransferState,
} from '@angular/core';

/**
 * Per-deployment configuration for the app chrome — branding/identity and
 * feature flags.
 *
 * Delivered to the browser via TransferState (see deployment-config.server.ts)
 * — no separate public config endpoint, no runtime fetch. Non-secret by
 * construction: the browser needs them to render.
 */
export interface DeploymentConfig {
  readonly branding: {
    readonly name: string;
    readonly logo: string;
  };
  /**
   * Whether cookie-consent gating is enforced. When false, no banner is shown
   * and non-essential storage is not gated — correct both while the app sets
   * only strictly-necessary storage, and for deployments in jurisdictions
   * without consent requirements (optional storage just loads).
   */
  readonly cookieConsentEnabled: boolean;
}

/**
 * Demo-shop defaults. Also the browser-side fallback when TransferState is
 * unavailable (e.g. a non-SSR render), so the chrome never renders empty.
 */
export const defaultDeploymentConfig: DeploymentConfig = {
  branding: { name: 'Coffee Kontor', logo: '/logo.svg' },
  cookieConsentEnabled: false,
};

export const DEPLOYMENT_CONFIG = new InjectionToken<DeploymentConfig>(
  'DEPLOYMENT_CONFIG',
);

export const DEPLOYMENT_CONFIG_STATE_KEY =
  makeStateKey<DeploymentConfig>('deploymentConfig');

/**
 * Browser provider: reads the config the server serialized into the initial
 * HTML. Falls back to the demo defaults if no transfer state is present.
 */
export function provideDeploymentConfig(): Provider {
  return {
    provide: DEPLOYMENT_CONFIG,
    useFactory: () =>
      inject(TransferState).get(
        DEPLOYMENT_CONFIG_STATE_KEY,
        defaultDeploymentConfig,
      ),
  };
}
