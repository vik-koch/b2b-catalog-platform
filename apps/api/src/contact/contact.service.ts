import { Inject, Injectable } from '@nestjs/common';
import { ContactRequest } from '@b2b-catalog-platform/shared';
import { env } from '../env';
import { MAILER, Mailer } from '../mail/mailer';
import { CONTACT_TEXT, ContactText } from './contact-text';

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
export class ContactService {
  constructor(
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(CONTACT_TEXT) private readonly text: ContactText,
  ) {}

  async submit(submission: ContactRequest): Promise<void> {
    const to = env.MAIL_CONTACT_TO;
    if (!to) {
      // env.ts requires this in server mode; this narrows the type.
      throw new Error('MAIL_CONTACT_TO is not configured');
    }

    await this.mailer.send({
      to,
      subject: `${this.text.contact.subject}: ${submission.name}`,
      replyTo: submission.email,
      html: this.renderHtml(submission),
      text: this.renderText(submission),
    });
  }

  private rows(s: ContactRequest): [string, string][] {
    const t = this.text.contact;
    return [
      [t.name, s.name],
      [t.email, s.email ?? '—'],
      [t.phone, s.phone ?? '—'],
      [t.preferredContact, s.preferredContact],
      [t.message, s.message ?? '—'],
    ];
  }

  private renderHtml(s: ContactRequest): string {
    return this.rows(s)
      .map(
        ([label, value]) =>
          `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`,
      )
      .join('\n');
  }

  private renderText(s: ContactRequest): string {
    return this.rows(s)
      .map(([label, value]) => `${label}: ${value}`)
      .join('\n');
  }
}
