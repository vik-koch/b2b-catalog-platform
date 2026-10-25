import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { StorefrontText, storefrontTextSchema } from './storefront-text.type';

/**
 * Complete, schema-shaped demo UI text for tests only. Loaded from the test
 * fixture's config through the normal CONFIG_PATH, which the test setup pins to
 * it — so the fixture can't drift from the real demo text.
 */
export const defaultStorefrontText: StorefrontText = loadConfig(
  storefrontTextSchema,
  'texts/storefront.json',
);
