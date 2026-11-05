import * as z from 'zod';
import {
  mergeShapes,
  refuseCountForms,
} from '@b2b-catalog-platform/shared/platform';
import { mailTextShape } from '../platform/mail/mail-text';
import { siteMailTextShape } from '../storefront/site/site-mail-text';
import { SITE_AREA } from '@b2b-catalog-platform/shared/core/site';
import { ACCOUNTS_AREA } from '@b2b-catalog-platform/shared/core/accounts';
import { accountsMailTextShape } from '../core/accounts/mail/accounts-mail-text';

// Zod only, so the tools that check a deployment can load these as well.

export const mailTextSchema = z
  .object(
    mergeShapes(mailTextShape, {
      [SITE_AREA]: z.object(siteMailTextShape).strict(),
      [ACCOUNTS_AREA]: z.object(accountsMailTextShape).strict(),
    }),
  )
  .strict()
  .superRefine(refuseCountForms);
