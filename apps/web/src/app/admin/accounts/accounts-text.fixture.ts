import * as z from 'zod';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { ACCOUNTS_AREA } from '@b2b-catalog-platform/shared/core/accounts';
import {
  AdminAccountsText,
  adminAccountsTextShape,
} from './accounts-text.type';

/** The accounts' block of the fixture's admin text, for specs. */
export const defaultAdminAccountsText: AdminAccountsText = loadConfig(
  z.object({ [ACCOUNTS_AREA]: z.object(adminAccountsTextShape) }),
  'texts/admin.json',
)[ACCOUNTS_AREA];
