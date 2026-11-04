import { inject, InjectionToken } from '@angular/core';
import {
  STOREFRONT_TEXT,
  storefrontTextPart,
} from '../../platform/config/storefront-text';
import type { StorefrontSiteText } from './site-text.type';

export const STOREFRONT_SITE_TEXT = new InjectionToken<StorefrontSiteText>(
  'STOREFRONT_SITE_TEXT',
  {
    providedIn: 'root',
    factory: () =>
      storefrontTextPart<StorefrontSiteText>(inject(STOREFRONT_TEXT)),
  },
);
