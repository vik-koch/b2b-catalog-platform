import { inject, InjectionToken } from '@angular/core';
import { ADMIN_TEXT, adminTextPart } from '../../platform/config/admin-text';
import type { AdminSiteText } from './admin-site-text.type';

/** Resolves only behind `adminTextGuard`, as `ADMIN_TEXT` does. */
export const ADMIN_SITE_TEXT = new InjectionToken<AdminSiteText>(
  'ADMIN_SITE_TEXT',
  {
    providedIn: 'root',
    factory: () => adminTextPart<AdminSiteText>(inject(ADMIN_TEXT)),
  },
);
