import { Provider } from '@angular/core';
import { DEPLOYMENT_CONFIG } from './deployment-config';
import {
  DeploymentConfig,
  deploymentConfigSchema,
} from '@b2b-catalog-platform/shared';
import { loadConfig } from '@b2b-catalog-platform/shared/node';

/**
 * Read once per process: the mounted file is immutable for the container's
 * lifetime, so there's no reason to re-read and re-validate on every SSR
 * request. A bad file throws here, at first render, and keeps the stack down.
 *
 * Constructed lazily because the production build imports this module
 * without any runtime environment.
 */
let cachedDeploymentConfig: DeploymentConfig | undefined;

/** The validated config. Also the source for the injected shell state. */
export function getDeploymentConfig(): DeploymentConfig {
  return (cachedDeploymentConfig ??= loadConfig(
    deploymentConfigSchema,
    'deployment.json',
  ));
}

/**
 * Load and validate the deployment config eagerly. Called from the Node entry
 * point at startup so a missing/invalid file fails the boot rather than
 * surfacing on the first SSR render. Safe to call before any render:
 * it only populates the cache the provider factory reuses.
 */
export function preloadDeploymentConfig(): void {
  getDeploymentConfig();
}

/**
 * Server provider: hands the render the config straight from the mounted file.
 * Merged after appConfig, so it wins over the browser provider during SSR —
 * which reads the document, and there is none on the server. Delivery to the
 * browser is separate, and the same for every route (see shell-state.server.ts).
 */
export function provideServerDeploymentConfig(): Provider {
  return { provide: DEPLOYMENT_CONFIG, useFactory: getDeploymentConfig };
}
