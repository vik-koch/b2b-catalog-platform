import { Inject, Injectable } from '@nestjs/common';
import { MailBranding, MAIL_BRANDING } from './mail-branding';
import { MailContent, renderMail } from './mail-layout';
import { MailText, MAIL_TEXT } from './mail-text';
import { MAILER, Mailer, MailAttachment } from './mailer';

/** Who the message goes to, and who a reply should reach. */
export interface MailEnvelope {
  readonly to: string;
  readonly replyTo?: string;
  /** Bytes the feature fetched; the template holds wording only. */
  readonly attachments?: readonly MailAttachment[];
}

/** Renders a template's content into the one branded layout and sends it, so
 * no feature touches markup. */
@Injectable()
export class MailService {
  constructor(
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(MAIL_BRANDING) private readonly branding: MailBranding,
    @Inject(MAIL_TEXT) private readonly text: MailText,
  ) {}

  async send(content: MailContent, envelope: MailEnvelope): Promise<void> {
    const rendered = renderMail(
      content,
      this.branding,
      this.text.common.footerNote,
    );
    await this.mailer.send({
      to: envelope.to,
      replyTo: envelope.replyTo,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      attachments: envelope.attachments,
    });
  }
}
