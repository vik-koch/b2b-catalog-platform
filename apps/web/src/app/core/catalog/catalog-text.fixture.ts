import {
  CATALOG_AREA,
  type SharedCatalogText,
} from '@b2b-catalog-platform/shared/core/catalog';

import { sharedTextBlock } from '../../platform/config/shared-text';
import { defaultSharedText } from '../../platform/config/shared-text.fixture';

/** The catalog's block of the fixture's shared text, for specs. */
export const defaultSharedCatalogText = sharedTextBlock<SharedCatalogText>(
  defaultSharedText,
  CATALOG_AREA,
);
