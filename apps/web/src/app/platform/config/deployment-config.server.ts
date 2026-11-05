import * as z from 'zod';
import { deploymentConfigShape } from '@b2b-catalog-platform/shared/platform';
import { mountedFile } from './mounted-file.server';

/** The keys no area claims, for what reads the file outside a render. Loose:
 * the root checks the file whole at boot. */
export const getDeploymentConfig = mountedFile(
  z.looseObject(deploymentConfigShape),
  'deployment.json',
);
