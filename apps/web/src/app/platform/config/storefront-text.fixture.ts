import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { StorefrontText, storefrontTextSchema } from './storefront-text.type';

/** The fixture's storefront text, for specs; the test setup pins CONFIG_PATH
 * to the fixture. */
export const defaultStorefrontText: StorefrontText = loadConfig(
  storefrontTextSchema,
  'texts/storefront.json',
);
