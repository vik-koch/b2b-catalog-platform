import { inject, InjectionToken } from '@angular/core';

import { ACCOUNTS_AREA } from '@b2b-catalog-platform/shared/core/accounts';

import {
  STOREFRONT_TEXT,
  storefrontTextBlock,
} from '../../platform/config/storefront-text';
import type { StorefrontAccountsText } from './accounts-text.type';

export const STOREFRONT_ACCOUNTS_TEXT =
  new InjectionToken<StorefrontAccountsText>('STOREFRONT_ACCOUNTS_TEXT', {
    providedIn: 'root',
    factory: () =>
      storefrontTextBlock<StorefrontAccountsText>(
        inject(STOREFRONT_TEXT),
        ACCOUNTS_AREA,
      ),
  });
