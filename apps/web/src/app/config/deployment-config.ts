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
  /**
   * Offices shown on the contact page.
   */
  readonly locations: readonly ContactLocation[];
  /**
   * Primary contact shown in the header bar and footer. Each field is optional
   * — an omitted field is simply not rendered; omit the whole object for none.
   */
  readonly contact?: {
    readonly phone?: string;
    readonly email?: string;
  };
}

/**
 * A map embed — restricted to an iframe URL by design.
 */
export interface MapEmbed {
  /**
   * iframe src. Deployment-owned, so trusted — bound as a resource URL.
   * OpenStreetMap/static for the demo; a provider endpoint per deployment.
   */
  readonly url: string;
  /**
   * Set when the embed sets cookies / loads tracking (e.g. Google Maps), so it
   * is withheld until consent allows it. Omit for no-cookie embeds (static
   * images, some map tiles), which render immediately.
   */
  readonly consentRequired?: boolean;
}

/** One office/branch shown on the contact page. */
export interface ContactLocation {
  readonly name: string;
  readonly description?: string;
  readonly map: MapEmbed;
}

/**
 * Demo-shop defaults. Also the browser-side fallback when TransferState is
 * unavailable (e.g. a non-SSR render), so the chrome never renders empty.
 */
export const defaultDeploymentConfig: DeploymentConfig = {
  branding: { name: 'Coffee Kontor', logo: '/logo.svg' },
  cookieConsentEnabled: false,
  locations: [
    {
      name: 'Speicherstadt Office',
      description: 'Am Sandtorkai 30, 20457 Hamburg',
      map: {
        // No-cookie OpenStreetMap embed → renders without consent.
        url: 'https://www.openstreetmap.org/export/embed.html?bbox=9.9820%2C53.5400%2C9.9950%2C53.5460&layer=mapnik&marker=53.5430%2C9.9880',
      },
    },
  ],
  contact: {
    phone: '+49 40 1234567',
    email: 'hallo@coffee-kontor.example',
  },
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
