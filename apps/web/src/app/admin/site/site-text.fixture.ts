import * as z from 'zod';

import { SITE_AREA } from '@b2b-catalog-platform/shared/core/site';
import { loadConfig } from '@b2b-catalog-platform/shared/node';

import { AdminSiteText, adminSiteTextShape } from './site-text.type';

/** The site's block of the fixture's admin text, for specs. */
export const defaultAdminSiteText: AdminSiteText = loadConfig(
  z.object({ [SITE_AREA]: z.object(adminSiteTextShape) }),
  'texts/admin.json',
)[SITE_AREA];
