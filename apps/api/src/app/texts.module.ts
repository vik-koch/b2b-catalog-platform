import { Global, Module } from '@nestjs/common';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { MAIL_TEXT } from '../platform/mail/mail-text';
import { mailTextSchema } from './app.texts';

/** The text files whose parts the areas own, checked whole at boot. Global,
 * as the mail module and the areas read them alike. */
@Global()
@Module({
  providers: [
    {
      provide: MAIL_TEXT,
      useFactory: () => loadConfig(mailTextSchema, 'texts/mail.json'),
    },
  ],
  exports: [MAIL_TEXT],
})
export class TextsModule {}
