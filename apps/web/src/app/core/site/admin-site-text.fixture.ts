import * as z from 'zod';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { AdminSiteText, adminSiteTextShape } from './admin-site-text.type';

/** The site's part of the fixture's admin text, for specs. */
export const defaultAdminSiteText: AdminSiteText = loadConfig(
  z.object(adminSiteTextShape),
  'texts/admin.json',
);
