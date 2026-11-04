import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { env } from '../env';
import { Mailer, MailMessage } from './mailer';

/** One adapter for Mailpit and any real provider; only the MAIL_* values
 * differ. */
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
        attachments: message.attachments?.map((file) => ({
          filename: file.fileName,
          contentType: file.contentType,
          content: file.bytes,
        })),
      });
      // Never the body: it holds personal data.
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
