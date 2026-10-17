import { Module } from '@nestjs/common';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { COMMON_TEXT, loadCommonText } from '../config/common-text';
import { PDF_TEXT, pdfTextSchema } from '../pdf/pdf-text';
import { loadMailBranding, MAIL_BRANDING } from './mail-branding';
import { MAIL_TEXT, mailTextSchema } from './mail-text';
import { MailDispatcher } from './mail-dispatcher';
import { MailService } from './mail.service';
import {
  loadNotificationAddresses,
  NOTIFICATION_ADDRESSES,
  NotificationAudiences,
} from './notification-audience';
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
      useFactory: () => loadConfig(mailTextSchema, 'texts/mail.json'),
    },
    { provide: COMMON_TEXT, useFactory: loadCommonText },
    {
      provide: PDF_TEXT,
      useFactory: () => loadConfig(pdfTextSchema, 'texts/pdf.json'),
    },
    { provide: MAIL_BRANDING, useFactory: loadMailBranding },
    MailService,
    MailDispatcher,
    {
      provide: NOTIFICATION_ADDRESSES,
      useFactory: loadNotificationAddresses,
    },
    NotificationAudiences,
  ],
  // The order summary's wording and branding travel with the mail's: it is
  // rendered from the same order, and carries the shop's name for the same
  // reason a message does.
  exports: [
    MAILER,
    MAIL_TEXT,
    COMMON_TEXT,
    PDF_TEXT,
    MAIL_BRANDING,
    MailService,
    MailDispatcher,
    {
      provide: NOTIFICATION_ADDRESSES,
      useFactory: loadNotificationAddresses,
    },
    NotificationAudiences,
  ],
})
export class MailModule {}
