import { Inject, Injectable, Logger } from '@nestjs/common';
import { InquiryRequest } from '@b2b-catalog-platform/shared';
import { env } from '../env';
import { MAILER, Mailer } from '../mail/mailer';
import { INQUIRY_TEXT, InquiryText } from './inquiry-text';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// User input goes into an HTML email — escape it so a message can't inject markup.
const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);

@Injectable()
export class InquiryService {
  private readonly logger = new Logger('Inquiry');

  constructor(
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(INQUIRY_TEXT) private readonly text: InquiryText,
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

    await this.mailer.send({
      to,
      subject: `${this.text.inquiry.subject}: ${submission.name}`,
      replyTo: submission.email,
      html: this.renderHtml(submission),
      text: this.renderText(submission),
    });
  }

  private rows(s: InquiryRequest): [string, string][] {
    const t = this.text.inquiry;
    return [
      [t.name, s.name],
      [t.email, s.email ?? '—'],
      [t.phone, s.phone ?? '—'],
      [t.preferredContact, s.preferredContact],
      [t.message, s.message ?? '—'],
    ];
  }

  private renderHtml(s: InquiryRequest): string {
    return this.rows(s)
      .map(
        ([label, value]) =>
          `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`,
      )
      .join('\n');
  }

  private renderText(s: InquiryRequest): string {
    return this.rows(s)
      .map(([label, value]) => `${label}: ${value}`)
      .join('\n');
  }
}
