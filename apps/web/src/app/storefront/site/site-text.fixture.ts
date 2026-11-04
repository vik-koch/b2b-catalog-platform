import * as z from 'zod';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { StorefrontSiteText, storefrontSiteTextShape } from './site-text.type';
import { SITE_AREA } from '@b2b-catalog-platform/shared/core/site';

/** The site's block of the fixture's storefront text, for specs. */
export const defaultStorefrontSiteText: StorefrontSiteText = loadConfig(
  z.object({ [SITE_AREA]: z.object(storefrontSiteTextShape) }),
  'texts/storefront.json',
)[SITE_AREA];
