import * as z from 'zod';
import {
  ACCOUNTS_AREA,
  accountsConfigShape,
  type AddressConfig,
  type CustomerType,
  type SignInStepConfig,
} from '@b2b-catalog-platform/shared/core/accounts';
import { loadDeploymentConfigBlock } from '../../platform/config/deployment-config';

const loadAccountsConfig = () =>
  loadDeploymentConfigBlock(
    ACCOUNTS_AREA,
    z.object(accountsConfigShape).strict(),
  );

/** The kinds of customer the shop sells to (FR-AUTH-13), wherever an account
 * or an order is written. */
export const ACCEPTED_CUSTOMER_TYPES = 'ACCEPTED_CUSTOMER_TYPES';

export function loadAcceptedCustomerTypes(): readonly CustomerType[] {
  return loadAccountsConfig().customerTypes;
}

export const ADDRESS_CONFIG = 'ADDRESS_CONFIG';

export function loadAddressConfig(): AddressConfig | undefined {
  return loadAccountsConfig().address;
}

export function loadSignInStep(): SignInStepConfig | undefined {
  return loadAccountsConfig().signInStep;
}
