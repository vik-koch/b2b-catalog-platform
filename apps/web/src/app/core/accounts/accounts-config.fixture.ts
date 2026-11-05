import type { DeploymentConfig } from '@b2b-catalog-platform/shared/platform';
import { defaultDeploymentConfig } from '../../platform/config/deployment-config.fixture';
import {
  ACCOUNTS_AREA,
  type AccountsConfig,
} from '@b2b-catalog-platform/shared/core/accounts';

/** The fixture's deployment config with the accounts' block changed. */
export function withAccounts(
  accounts: Partial<AccountsConfig>,
  config: DeploymentConfig = defaultDeploymentConfig,
): DeploymentConfig {
  return {
    ...config,
    [ACCOUNTS_AREA]: { ...config[ACCOUNTS_AREA], ...accounts },
  };
}
