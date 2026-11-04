import * as z from 'zod';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { StorefrontText, storefrontTextShape } from './storefront-text.type';

/** The fixture's storefront text, for specs; the test setup pins CONFIG_PATH
 * to the fixture. Loose, so the areas' parts ride along for their tokens. */
export const defaultStorefrontText: StorefrontText = loadConfig(
  z.looseObject(storefrontTextShape),
  'texts/storefront.json',
);
