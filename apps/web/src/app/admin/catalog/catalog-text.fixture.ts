import * as z from 'zod';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { CATALOG_AREA } from '@b2b-catalog-platform/shared/core/catalog';
import { AdminCatalogText, adminCatalogTextShape } from './catalog-text.type';

/** The catalog's block of the fixture's admin text, for specs. */
export const defaultAdminCatalogText: AdminCatalogText = loadConfig(
  z.object({ [CATALOG_AREA]: z.object(adminCatalogTextShape) }),
  'texts/admin.json',
)[CATALOG_AREA];
