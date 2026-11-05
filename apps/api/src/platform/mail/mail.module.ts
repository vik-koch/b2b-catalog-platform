import { Module } from '@nestjs/common';
import { SHARED_TEXT, loadSharedText } from '../config/shared-text';
import { loadMailBranding, MAIL_BRANDING } from './mail-branding';
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
 * no built-in default, so a bad file fails the boot, not a mail. The mail
 * and PDF texts themselves come from the root's TextsModule. */
@Module({
  providers: [
    { provide: MAILER, useClass: SmtpMailer },
    { provide: SHARED_TEXT, useFactory: loadSharedText },
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
    SHARED_TEXT,
    MAIL_BRANDING,
    MailService,
    MailDispatcher,
    NOTIFICATION_ADDRESSES,
    NotificationAudiences,
  ],
})
export class MailModule {}
