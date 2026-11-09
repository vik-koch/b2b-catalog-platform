import { inject, InjectionToken } from '@angular/core';

import { SITE_AREA } from '@b2b-catalog-platform/shared/core/site';

import { ADMIN_TEXT, adminTextBlock } from '../../platform/config/admin-text';
import type { AdminSiteText } from './site-text.type';

/** Resolves only behind `adminTextGuard`, as `ADMIN_TEXT` does. */
export const ADMIN_SITE_TEXT = new InjectionToken<AdminSiteText>(
  'ADMIN_SITE_TEXT',
  {
    providedIn: 'root',
    factory: () => adminTextBlock<AdminSiteText>(inject(ADMIN_TEXT), SITE_AREA),
  },
);
