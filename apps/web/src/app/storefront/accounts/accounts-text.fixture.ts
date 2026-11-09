import * as z from 'zod';

import { ACCOUNTS_AREA } from '@b2b-catalog-platform/shared/core/accounts';
import { loadConfig } from '@b2b-catalog-platform/shared/node';

import {
  StorefrontAccountsText,
  storefrontAccountsTextShape,
} from './accounts-text.type';

/** The accounts' block of the fixture's storefront text, for specs. */
export const defaultStorefrontAccountsText: StorefrontAccountsText = loadConfig(
  z.object({ [ACCOUNTS_AREA]: z.object(storefrontAccountsTextShape) }),
  'texts/storefront.json',
)[ACCOUNTS_AREA];
