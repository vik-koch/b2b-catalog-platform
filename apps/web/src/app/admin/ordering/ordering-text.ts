import { inject, InjectionToken } from '@angular/core';

import { ORDERING_AREA } from '@b2b-catalog-platform/shared/core/ordering';

import { ADMIN_TEXT, adminTextBlock } from '../../platform/config/admin-text';
import type { AdminOrderingText } from './ordering-text.type';

/** Resolves only behind `adminTextGuard`, as `ADMIN_TEXT` does. */
export const ADMIN_ORDERING_TEXT = new InjectionToken<AdminOrderingText>(
  'ADMIN_ORDERING_TEXT',
  {
    providedIn: 'root',
    factory: () =>
      adminTextBlock<AdminOrderingText>(inject(ADMIN_TEXT), ORDERING_AREA),
  },
);
