import { inject, InjectionToken } from '@angular/core';
import { ACCOUNTS_AREA } from '@b2b-catalog-platform/shared/core/accounts';
import { ADMIN_TEXT, adminTextBlock } from '../../platform/config/admin-text';
import type { AdminAccountsText } from './accounts-text.type';

/** Resolves only behind `adminTextGuard`, as `ADMIN_TEXT` does. */
export const ADMIN_ACCOUNTS_TEXT = new InjectionToken<AdminAccountsText>(
  'ADMIN_ACCOUNTS_TEXT',
  {
    providedIn: 'root',
    factory: () =>
      adminTextBlock<AdminAccountsText>(inject(ADMIN_TEXT), ACCOUNTS_AREA),
  },
);
