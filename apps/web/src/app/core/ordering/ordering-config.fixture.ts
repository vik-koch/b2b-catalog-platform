import {
  ORDERING_AREA,
  type OrderingConfig,
} from '@b2b-catalog-platform/shared/core/ordering';
import type { DeploymentConfigFile } from '@b2b-catalog-platform/shared/deployment';

import { defaultDeploymentConfig } from '../../platform/config/deployment-config.fixture';

/** The fixture's deployment config with ordering's block changed. */
export function withOrdering(
  ordering: Partial<OrderingConfig>,
  config: DeploymentConfigFile = defaultDeploymentConfig,
): DeploymentConfigFile {
  return {
    ...config,
    [ORDERING_AREA]: { ...config[ORDERING_AREA], ...ordering },
  };
}
