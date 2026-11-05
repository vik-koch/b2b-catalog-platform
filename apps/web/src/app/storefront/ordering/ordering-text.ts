import { inject, InjectionToken } from '@angular/core';
import { ORDERING_AREA } from '@b2b-catalog-platform/shared/core/ordering';
import {
  STOREFRONT_TEXT,
  storefrontTextBlock,
} from '../../platform/config/storefront-text';
import type { StorefrontOrderingText } from './ordering-text.type';

export const STOREFRONT_ORDERING_TEXT =
  new InjectionToken<StorefrontOrderingText>('STOREFRONT_ORDERING_TEXT', {
    providedIn: 'root',
    factory: () =>
      storefrontTextBlock<StorefrontOrderingText>(
        inject(STOREFRONT_TEXT),
        ORDERING_AREA,
      ),
  });
