import { inject, InjectionToken } from '@angular/core';
import { EXCHANGE_AREA } from '@b2b-catalog-platform/shared/core/exchange';
import { ADMIN_TEXT, adminTextBlock } from '../../platform/config/admin-text';
import type { AdminExchangeText } from './exchange-text.type';

/** Resolves only behind `adminTextGuard`, as `ADMIN_TEXT` does. */
export const ADMIN_EXCHANGE_TEXT = new InjectionToken<AdminExchangeText>(
  'ADMIN_EXCHANGE_TEXT',
  {
    providedIn: 'root',
    factory: () =>
      adminTextBlock<AdminExchangeText>(inject(ADMIN_TEXT), EXCHANGE_AREA),
  },
);
