import { inject, InjectionToken } from '@angular/core';
import {
  CATALOG_AREA,
  type SharedCatalogText,
} from '@b2b-catalog-platform/shared/core/catalog';
import {
  SHARED_TEXT,
  sharedTextBlock,
} from '../../platform/config/shared-text';

/** What the catalog's views say in both audiences. */
export const SHARED_CATALOG_TEXT = new InjectionToken<SharedCatalogText>(
  'SHARED_CATALOG_TEXT',
  {
    providedIn: 'root',
    factory: () =>
      sharedTextBlock<SharedCatalogText>(inject(SHARED_TEXT), CATALOG_AREA),
  },
);
