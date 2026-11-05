import * as z from 'zod';
import {
  mergeShapes,
  refuseCountForms,
} from '@b2b-catalog-platform/shared/platform';
import { adminTextShape } from './platform/config/admin-text.type';
import { storefrontTextShape } from './platform/config/storefront-text.type';
import { adminSiteTextShape } from './admin/site/site-text.type';
import { storefrontSiteTextShape } from './storefront/site/site-text.type';
import { SITE_AREA } from '@b2b-catalog-platform/shared/core/site';
import { CATALOG_AREA } from '@b2b-catalog-platform/shared/core/catalog';
import { storefrontCatalogTextShape } from './storefront/catalog/catalog-text.type';
import { adminCatalogTextShape } from './admin/catalog/catalog-text.type';

// Zod only, so the tools that check a deployment can load these as well.

/** What a visitor or user can reach, injected into every document. */
export const storefrontTextSchema = z
  .object(
    mergeShapes(storefrontTextShape, {
      [SITE_AREA]: z.object(storefrontSiteTextShape).strict(),
      [CATALOG_AREA]: z.object(storefrontCatalogTextShape).strict(),
    }),
  )
  .strict()
  .superRefine(refuseCountForms);

/** What an admin session reads, fetched after the admin guard. */
export const adminTextSchema = z
  .object(
    mergeShapes(adminTextShape, {
      [SITE_AREA]: z.object(adminSiteTextShape).strict(),
      [CATALOG_AREA]: z.object(adminCatalogTextShape).strict(),
    }),
  )
  .strict()
  .superRefine(refuseCountForms);
