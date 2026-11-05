import type { DeploymentConfig } from '@b2b-catalog-platform/shared/platform';
import { defaultDeploymentConfig } from '../../platform/config/deployment-config.fixture';
import {
  ORDERING_AREA,
  type OrderingConfig,
} from '@b2b-catalog-platform/shared/core/ordering';

/** The fixture's deployment config with ordering's block changed. */
export function withOrdering(
  ordering: Partial<OrderingConfig>,
  config: DeploymentConfig = defaultDeploymentConfig,
): DeploymentConfig {
  return {
    ...config,
    [ORDERING_AREA]: { ...config[ORDERING_AREA], ...ordering },
  };
}
