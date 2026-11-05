import { Module } from '@nestjs/common';
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
 * no built-in default, so a bad file fails the boot, not a mail. The mail,
 * PDF and shared texts themselves come from the root's TextsModule. */
@Module({
  providers: [
    { provide: MAILER, useClass: SmtpMailer },
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
    MAIL_BRANDING,
    MailService,
    MailDispatcher,
    NOTIFICATION_ADDRESSES,
    NotificationAudiences,
  ],
})
export class MailModule {}
