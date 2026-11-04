import { Module } from '@nestjs/common';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { SHARED_TEXT, loadSharedText } from '../config/shared-text';
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

/** Mail over the SMTP adapter, and the texts and branding it is written in:
 * no built-in default, so a bad file fails the boot, not a mail. */
@Module({
  providers: [
    { provide: MAILER, useClass: SmtpMailer },
    {
      provide: MAIL_TEXT,
      useFactory: () => loadConfig(mailTextSchema, 'texts/mail.json'),
    },
    { provide: SHARED_TEXT, useFactory: loadSharedText },
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
  // The order summary is drawn from the same texts and branding.
  exports: [
    MAILER,
    MAIL_TEXT,
    SHARED_TEXT,
    PDF_TEXT,
    MAIL_BRANDING,
    MailService,
    MailDispatcher,
    NOTIFICATION_ADDRESSES,
    NotificationAudiences,
  ],
})
export class MailModule {}
