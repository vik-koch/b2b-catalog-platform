import * as z from 'zod';

import { SITE_AREA } from '@b2b-catalog-platform/shared/core/site';
import { loadConfig } from '@b2b-catalog-platform/shared/node';

import { StorefrontSiteText, storefrontSiteTextShape } from './site-text.type';

/** The site's block of the fixture's storefront text, for specs. */
export const defaultStorefrontSiteText: StorefrontSiteText = loadConfig(
  z.object({ [SITE_AREA]: z.object(storefrontSiteTextShape) }),
  'texts/storefront.json',
)[SITE_AREA];
