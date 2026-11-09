import { Global, Module } from '@nestjs/common';

import { sharedTextSchema } from '@b2b-catalog-platform/shared/deployment';
import { loadConfig } from '@b2b-catalog-platform/shared/node';

import { SHARED_TEXT } from '../platform/config/shared-text';
import { MAIL_TEXT } from '../platform/mail/mail-text';
import { PDF_TEXT } from '../platform/pdf/pdf-text';
import { mailTextSchema, pdfTextSchema } from './app.texts';

/** The text files whose parts the areas own, checked whole at boot. Global,
 * as platform and the areas read them alike. */
@Global()
@Module({
  providers: [
    {
      provide: SHARED_TEXT,
      useFactory: () => loadConfig(sharedTextSchema, 'texts/shared.json'),
    },
    {
      provide: MAIL_TEXT,
      useFactory: () => loadConfig(mailTextSchema, 'texts/mail.json'),
    },
    {
      provide: PDF_TEXT,
      useFactory: () => loadConfig(pdfTextSchema, 'texts/pdf.json'),
    },
  ],
  exports: [SHARED_TEXT, MAIL_TEXT, PDF_TEXT],
})
export class TextsModule {}
