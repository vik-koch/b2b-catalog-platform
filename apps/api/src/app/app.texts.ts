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
import { ORDERING_AREA } from '@b2b-catalog-platform/shared/core/ordering';
import { orderingMailTextShape } from '../core/ordering/mail/ordering-mail-text';
import { EXCHANGE_AREA } from '@b2b-catalog-platform/shared/core/exchange';
import { exchangeMailTextShape } from '../core/exchange/exchange-mail-text';
import { pdfTextShape } from '../platform/pdf/pdf-text';
import { orderingPdfTextShape } from '../core/ordering/ordering-pdf-text';

// Zod only, so the tools that check a deployment can load these as well.

export const mailTextSchema = z
  .object(
    mergeShapes(mailTextShape, {
      [SITE_AREA]: z.object(siteMailTextShape).strict(),
      [ACCOUNTS_AREA]: z.object(accountsMailTextShape).strict(),
      [ORDERING_AREA]: z.object(orderingMailTextShape).strict(),
      [EXCHANGE_AREA]: z.object(exchangeMailTextShape).strict(),
    }),
  )
  .strict()
  .superRefine(refuseCountForms);

export const pdfTextSchema = z
  .object(
    mergeShapes(pdfTextShape, {
      [ORDERING_AREA]: z.object(orderingPdfTextShape).strict(),
    }),
  )
  .strict()
  .superRefine(refuseCountForms);
