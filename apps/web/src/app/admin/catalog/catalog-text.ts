import { inject, InjectionToken } from '@angular/core';
import { CATALOG_AREA } from '@b2b-catalog-platform/shared/core/catalog';
import { ADMIN_TEXT, adminTextBlock } from '../../platform/config/admin-text';
import type { AdminCatalogText } from './catalog-text.type';

/** Resolves only behind `adminTextGuard`, as `ADMIN_TEXT` does. */
export const ADMIN_CATALOG_TEXT = new InjectionToken<AdminCatalogText>(
  'ADMIN_CATALOG_TEXT',
  {
    providedIn: 'root',
    factory: () =>
      adminTextBlock<AdminCatalogText>(inject(ADMIN_TEXT), CATALOG_AREA),
  },
);
