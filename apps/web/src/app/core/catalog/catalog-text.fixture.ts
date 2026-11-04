import { defaultSharedText } from '../../platform/config/shared-text.fixture';
import {
  CATALOG_AREA,
  type SharedCatalogText,
} from '@b2b-catalog-platform/shared/core/catalog';
import { sharedTextBlock } from '../../platform/config/shared-text';

/** The catalog's block of the fixture's shared text, for specs. */
export const defaultSharedCatalogText = sharedTextBlock<SharedCatalogText>(
  defaultSharedText,
  CATALOG_AREA,
);
