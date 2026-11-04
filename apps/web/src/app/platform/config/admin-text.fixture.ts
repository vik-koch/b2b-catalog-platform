import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { AdminText, adminTextSchema } from './admin-text.type';

/** The fixture's admin text, for specs. */
export const defaultAdminText: AdminText = loadConfig(
  adminTextSchema,
  'texts/admin.json',
);
