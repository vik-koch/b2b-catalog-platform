import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { AdminText, adminTextSchema } from './admin-text.type';

/**
 * Complete, schema-shaped demo admin text for tests only. Loaded from the same
 * committed config file the app serves at runtime (see storefront-text.fixture.ts),
 * so it cannot drift from the real wording.
 */
export const defaultAdminText: AdminText = loadConfig(
  adminTextSchema,
  'texts/admin.json',
);
