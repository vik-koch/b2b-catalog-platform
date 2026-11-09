import { inject, InjectionToken } from '@angular/core';

import {
  ACCOUNTS_AREA,
  type SharedAccountsText,
} from '@b2b-catalog-platform/shared/core/accounts';

import {
  SHARED_TEXT,
  sharedTextBlock,
} from '../../platform/config/shared-text';

/** What the accounts' views say in both audiences. */
export const SHARED_ACCOUNTS_TEXT = new InjectionToken<SharedAccountsText>(
  'SHARED_ACCOUNTS_TEXT',
  {
    providedIn: 'root',
    factory: () =>
      sharedTextBlock<SharedAccountsText>(inject(SHARED_TEXT), ACCOUNTS_AREA),
  },
);
