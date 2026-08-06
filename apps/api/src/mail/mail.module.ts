import { Module } from '@nestjs/common';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { loadMailBranding, MAIL_BRANDING } from './mail-branding';
import { MAIL_TEXT, mailTextSchema } from './mail-text';
import { MailService } from './mail.service';
import { MAILER } from './mailer';
import { SmtpMailer } from './smtp-mailer';

/**
 * Provides the Mailer port bound to the SMTP adapter, plus the MailService that
 * renders the branded layout on top of it. Feature modules import this module
 * and inject MailService (MAILER stays exported for the transport itself).
 * Swapping the adapter (e.g. a private provider API) is a one-line change here.
 *
 * Wording and branding load whole from the mounted config files, with no
 * built-in default: an unset var or a bad/incomplete file fails the boot rather
 * than sending demo-worded or unbranded mail.
 */
@Module({
  providers: [
    { provide: MAILER, useClass: SmtpMailer },
    {
      provide: MAIL_TEXT,
      useFactory: () => loadConfig(mailTextSchema, 'MAIL_TEXT_FILE'),
    },
    { provide: MAIL_BRANDING, useFactory: loadMailBranding },
    MailService,
  ],
  exports: [MAILER, MAIL_TEXT, MailService],
})
export class MailModule {}
