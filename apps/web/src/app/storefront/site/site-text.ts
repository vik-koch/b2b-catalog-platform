import { inject, InjectionToken } from '@angular/core';

import { SITE_AREA } from '@b2b-catalog-platform/shared/core/site';

import {
  STOREFRONT_TEXT,
  storefrontTextBlock,
} from '../../platform/config/storefront-text';
import type { StorefrontSiteText } from './site-text.type';

export const STOREFRONT_SITE_TEXT = new InjectionToken<StorefrontSiteText>(
  'STOREFRONT_SITE_TEXT',
  {
    providedIn: 'root',
    factory: () =>
      storefrontTextBlock<StorefrontSiteText>(
        inject(STOREFRONT_TEXT),
        SITE_AREA,
      ),
  },
);
