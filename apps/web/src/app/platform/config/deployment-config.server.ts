import { Provider } from '@angular/core';
import { deploymentConfigSchema } from '@b2b-catalog-platform/shared/platform';
import { DEPLOYMENT_CONFIG } from './deployment-config';
import { mountedFile } from './mounted-file.server';

export const getDeploymentConfig = mountedFile(
  deploymentConfigSchema,
  'deployment.json',
);

/** At boot, so a bad file stops the start rather than the first render. */
export function preloadDeploymentConfig(): void {
  getDeploymentConfig();
}

/** Merged after appConfig, so the render reads the file, not the document. */
export function provideServerDeploymentConfig(): Provider {
  return { provide: DEPLOYMENT_CONFIG, useFactory: getDeploymentConfig };
}
