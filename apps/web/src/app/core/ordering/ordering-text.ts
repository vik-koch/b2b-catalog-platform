import { inject, InjectionToken } from '@angular/core';

import {
  ORDERING_AREA,
  type SharedOrderingText,
} from '@b2b-catalog-platform/shared/core/ordering';

import {
  SHARED_TEXT,
  sharedTextBlock,
} from '../../platform/config/shared-text';

/** What ordering's views say in both audiences. */
export const SHARED_ORDERING_TEXT = new InjectionToken<SharedOrderingText>(
  'SHARED_ORDERING_TEXT',
  {
    providedIn: 'root',
    factory: () =>
      sharedTextBlock<SharedOrderingText>(inject(SHARED_TEXT), ORDERING_AREA),
  },
);
