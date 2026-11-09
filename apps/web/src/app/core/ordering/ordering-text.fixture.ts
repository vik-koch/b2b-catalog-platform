import {
  ORDERING_AREA,
  type SharedOrderingText,
} from '@b2b-catalog-platform/shared/core/ordering';

import { sharedTextBlock } from '../../platform/config/shared-text';
import { defaultSharedText } from '../../platform/config/shared-text.fixture';

/** Ordering's block of the fixture's shared text, for specs. */
export const defaultSharedOrderingText = sharedTextBlock<SharedOrderingText>(
  defaultSharedText,
  ORDERING_AREA,
);
