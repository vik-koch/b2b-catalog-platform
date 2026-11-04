import * as z from 'zod';
import {
  mergeShapes,
  refuseCountForms,
} from '@b2b-catalog-platform/shared/platform';
import { adminTextShape } from './platform/config/admin-text.type';
import { storefrontTextShape } from './platform/config/storefront-text.type';
import { adminSiteTextShape } from './core/site/admin-site-text.type';
import { storefrontSiteTextShape } from './storefront/site/site-text.type';

// Zod only, so the tools that check a deployment can load these as well.

/** What a visitor or user can reach, injected into every document. */
export const storefrontTextSchema = z
  .object(mergeShapes(storefrontTextShape, storefrontSiteTextShape))
  .strict()
  .superRefine(refuseCountForms);

/** What an admin session reads, fetched after the admin guard. */
export const adminTextSchema = z
  .object(mergeShapes(adminTextShape, adminSiteTextShape))
  .strict()
  .superRefine(refuseCountForms);
