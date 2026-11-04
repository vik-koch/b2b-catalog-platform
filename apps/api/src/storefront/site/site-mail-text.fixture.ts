import * as z from 'zod';
import { loadConfigFile } from '@b2b-catalog-platform/shared/node';
import { SiteMailText, siteMailTextShape } from './site-mail-text';

/** The site's part of the demo mail text, for specs. */
export const demoSiteMailText: SiteMailText = loadConfigFile(
  z.object(siteMailTextShape),
  'deployments/fixture/config/texts/mail.json',
);
