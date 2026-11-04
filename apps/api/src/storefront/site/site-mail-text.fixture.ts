import * as z from 'zod';
import { loadConfigFile } from '@b2b-catalog-platform/shared/node';
import { SiteMailText, siteMailTextShape } from './site-mail-text';
import { SITE_AREA } from '@b2b-catalog-platform/shared/core/site';

/** The site's block of the demo mail text, for specs. */
export const demoSiteMailText: SiteMailText = loadConfigFile(
  z.object({ [SITE_AREA]: z.object(siteMailTextShape) }),
  'deployments/fixture/config/texts/mail.json',
)[SITE_AREA];
