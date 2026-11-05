import type * as z from 'zod';
import {
  ACCOUNTS_AREA,
  type accountsConfigShape,
  type AddressConfig,
  type CustomerType,
  type SignInStepConfig,
} from '@b2b-catalog-platform/shared/core/accounts';
import { loadDeploymentConfigBlock } from '../../platform/config/deployment-config';

/** Parsed, not read-only, as the API's services are typed by the schemas. */
type AccountsConfig = z.infer<z.ZodObject<typeof accountsConfigShape>>;

const loadAccountsConfig = () =>
  loadDeploymentConfigBlock<AccountsConfig>(ACCOUNTS_AREA);

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
