import { Provider } from '@angular/core';

import { deploymentConfigSchema } from '@b2b-catalog-platform/shared/deployment';

import { DEPLOYMENT_CONFIG } from './platform/config/deployment-config';
import { mountedFile } from './platform/config/mounted-file.server';

/** Whole, every area's block checked: what the render and the document get. */
export const getDeploymentConfigFile = mountedFile(
  deploymentConfigSchema,
  'deployment.json',
);

/** At boot, so a bad file stops the start rather than the first render. */
export function preloadDeploymentConfig(): void {
  getDeploymentConfigFile();
}

/** Merged after appConfig, so the render reads the file, not the document. */
export function provideServerDeploymentConfig(): Provider {
  return { provide: DEPLOYMENT_CONFIG, useFactory: getDeploymentConfigFile };
}
