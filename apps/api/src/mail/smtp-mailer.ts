import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { env } from '../env';
import { Mailer, MailMessage } from './mailer';

/**
 * SMTP adapter for the Mailer port. Universal by design — the same
 * code serves Mailpit (dev/demo) and any real provider (prod); only the MAIL_*
 * config differs. Presence of that config is validated in env.ts (server mode).
 */
@Injectable()
export class SmtpMailer implements Mailer {
  private readonly logger = new Logger('Mailer');
  private readonly transport: Transporter = createTransport({
    host: env.MAIL_HOST,
    port: env.MAIL_PORT,
    // Implicit TLS (port 465). Unset for STARTTLS providers and for Mailpit.
    secure: env.MAIL_SECURE === 'true',
    // Mailpit needs no auth; a real provider sets MAIL_USER/MAIL_PASSWORD.
    auth: env.MAIL_USER
      ? { user: env.MAIL_USER, pass: env.MAIL_PASSWORD }
      : undefined,
  });

  async send(message: MailMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: env.MAIL_FROM,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        replyTo: message.replyTo,
      });
      // Metadata only — never the body (name/phone/message are PII).
      this.logger.log(`Sent "${message.subject}" to ${message.to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send "${message.subject}" to ${message.to}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}
