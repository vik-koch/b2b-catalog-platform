import * as z from 'zod';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { StorefrontSiteText, storefrontSiteTextShape } from './site-text.type';

/** The site's part of the fixture's storefront text, for specs. */
export const defaultStorefrontSiteText: StorefrontSiteText = loadConfig(
  z.object(storefrontSiteTextShape),
  'texts/storefront.json',
);
