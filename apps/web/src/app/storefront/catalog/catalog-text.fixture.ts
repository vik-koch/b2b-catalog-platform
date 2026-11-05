import * as z from 'zod';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { CATALOG_AREA } from '@b2b-catalog-platform/shared/core/catalog';
import {
  StorefrontCatalogText,
  storefrontCatalogTextShape,
} from './catalog-text.type';

/** The catalog's block of the fixture's storefront text, for specs. */
export const defaultStorefrontCatalogText: StorefrontCatalogText = loadConfig(
  z.object({ [CATALOG_AREA]: z.object(storefrontCatalogTextShape) }),
  'texts/storefront.json',
)[CATALOG_AREA];
