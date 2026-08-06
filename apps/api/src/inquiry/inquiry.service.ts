import { Inject, Injectable, Logger } from '@nestjs/common';
import { InquiryRequest } from '@b2b-catalog-platform/shared';
import { env } from '../env';
import { MailService } from '../mail/mail.service';
import { MAIL_TEXT, MailText } from '../mail/mail-text';
import { inquiryMail } from '../mail/templates/inquiry.template';

@Injectable()
export class InquiryService {
  private readonly logger = new Logger('Inquiry');

  constructor(
    private readonly mail: MailService,
    @Inject(MAIL_TEXT) private readonly text: MailText,
  ) {}

  async submit(submission: InquiryRequest): Promise<void> {
    // Honeypot: drop it silently toward the caller — no mail, no error, a
    // normal 200 with no hint the decoy tripped — but log it server-side so
    // honeypot hits stay visible for spam monitoring. Log the fact only, no
    // submission content (no PII in logs).
    if (submission.website) {
      this.logger.warn('Rejected inquiry: honeypot field populated');
      return;
    }

    const to = env.MAIL_CONTACT_TO;
    if (!to) {
      // env.ts requires this in server mode; this narrows the type.
      throw new Error('MAIL_CONTACT_TO is not configured');
    }

    await this.mail.send(inquiryMail(submission, this.text), {
      to,
      // The submitter, so the shop can answer by hitting reply.
      replyTo: submission.email,
    });
  }
}
