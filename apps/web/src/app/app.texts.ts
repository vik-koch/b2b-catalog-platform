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
import { ACCOUNTS_AREA } from '@b2b-catalog-platform/shared/core/accounts';
import { storefrontAccountsTextShape } from './storefront/accounts/accounts-text.type';
import { adminAccountsTextShape } from './admin/accounts/accounts-text.type';
import { ORDERING_AREA } from '@b2b-catalog-platform/shared/core/ordering';
import { storefrontOrderingTextShape } from './storefront/ordering/ordering-text.type';
import { adminOrderingTextShape } from './admin/ordering/ordering-text.type';

// Zod only, so the tools that check a deployment can load these as well.

/** What a visitor or user can reach, injected into every document. */
export const storefrontTextSchema = z
  .object(
    mergeShapes(storefrontTextShape, {
      [SITE_AREA]: z.object(storefrontSiteTextShape).strict(),
      [CATALOG_AREA]: z.object(storefrontCatalogTextShape).strict(),
      [ACCOUNTS_AREA]: z.object(storefrontAccountsTextShape).strict(),
      [ORDERING_AREA]: z.object(storefrontOrderingTextShape).strict(),
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
      [ACCOUNTS_AREA]: z.object(adminAccountsTextShape).strict(),
      [ORDERING_AREA]: z.object(adminOrderingTextShape).strict(),
    }),
  )
  .strict()
  .superRefine(refuseCountForms);
