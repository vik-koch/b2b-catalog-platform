import { inject, InjectionToken } from '@angular/core';
import { CATALOG_AREA } from '@b2b-catalog-platform/shared/core/catalog';
import {
  STOREFRONT_TEXT,
  storefrontTextBlock,
} from '../../platform/config/storefront-text';
import type { StorefrontCatalogText } from './catalog-text.type';

export const STOREFRONT_CATALOG_TEXT =
  new InjectionToken<StorefrontCatalogText>('STOREFRONT_CATALOG_TEXT', {
    providedIn: 'root',
    factory: () =>
      storefrontTextBlock<StorefrontCatalogText>(
        inject(STOREFRONT_TEXT),
        CATALOG_AREA,
      ),
  });
