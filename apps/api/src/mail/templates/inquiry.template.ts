import { CommonText, InquiryRequest } from '@b2b-catalog-platform/shared';
import { MailContent } from '../mail-layout';
import { MailText } from '../mail-text';

/**
 * The inquiry form's message to the shop (FR-NAV-06) — the one email with an
 * external sender, so the caller sets the submitter as Reply-To.
 *
 * Fields the visitor left empty are still listed, with a dash: the shop reads
 * these in sequence and a missing row would be easy to misread as a different
 * message shape.
 */
export function inquiryMail(
  submission: InquiryRequest,
  text: MailText,
  common: CommonText,
): MailContent {
  const t = text.inquiry;
  const fields = common.fields;
  return {
    subject: `${t.subject}: ${submission.name}`,
    preheader: t.preheader,
    heading: t.heading,
    rows: [
      { label: fields.name.label, value: submission.name },
      { label: fields.email.label, value: submission.email ?? '—' },
      { label: fields.phone.label, value: submission.phone ?? '—' },
      { label: t.preferredContact, value: submission.preferredContact },
      { label: t.message, value: submission.message ?? '—' },
    ],
  };
}
