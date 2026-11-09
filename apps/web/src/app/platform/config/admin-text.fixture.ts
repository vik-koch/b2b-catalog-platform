import * as z from 'zod';

import { loadConfig } from '@b2b-catalog-platform/shared/node';

import { AdminText, adminTextShape } from './admin-text.type';

/** The fixture's admin text, for specs. Loose, so the areas' parts ride along
 * for their tokens. */
export const defaultAdminText: AdminText = loadConfig(
  z.looseObject(adminTextShape),
  'texts/admin.json',
);
