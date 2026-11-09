import * as z from 'zod';

import { ACCOUNTS_AREA } from '@b2b-catalog-platform/shared/core/accounts';
import { loadConfigFile } from '@b2b-catalog-platform/shared/node';

import { AccountsMailText, accountsMailTextShape } from './accounts-mail-text';

/** The accounts' block of the demo mail text, for specs. */
export const demoAccountsMailText: AccountsMailText = loadConfigFile(
  z.object({ [ACCOUNTS_AREA]: z.object(accountsMailTextShape) }),
  'deployments/fixture/config/texts/mail.json',
)[ACCOUNTS_AREA];
