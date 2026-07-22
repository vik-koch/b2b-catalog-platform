import { Module } from '@nestjs/common';
import { MAILER } from './mailer';
import { SmtpMailer } from './smtp-mailer';

/**
 * Provides the Mailer port bound to the SMTP adapter. Feature modules that send
 * email import this module and inject MAILER. Swapping the adapter (e.g. a
 * private provider API) is a one-line change here.
 */
@Module({
  providers: [{ provide: MAILER, useClass: SmtpMailer }],
  exports: [MAILER],
})
export class MailModule {}
