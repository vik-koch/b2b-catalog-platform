import type { DeploymentConfigFile } from '@b2b-catalog-platform/shared/deployment';
import { defaultDeploymentConfig } from '../../platform/config/deployment-config.fixture';
import {
  ACCOUNTS_AREA,
  type AccountsConfig,
} from '@b2b-catalog-platform/shared/core/accounts';

/** The fixture's deployment config with the accounts' block changed. */
export function withAccounts(
  accounts: Partial<AccountsConfig>,
  config: DeploymentConfigFile = defaultDeploymentConfig,
): DeploymentConfigFile {
  return {
    ...config,
    [ACCOUNTS_AREA]: { ...config[ACCOUNTS_AREA], ...accounts },
  };
}
