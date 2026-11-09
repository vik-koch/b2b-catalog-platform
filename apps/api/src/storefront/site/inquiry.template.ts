import { SharedText } from '@b2b-catalog-platform/shared/platform';
import { InquiryRequest } from '@b2b-catalog-platform/shared/storefront/site';

import { MailContent } from '../../platform/mail/mail-layout';
import { SiteMailText } from './site-mail-text';

/** The inquiry form's mail to the shop (FR-NAV-06), the one with an outside
 * sender, who becomes the Reply-To. Empty fields show a dash, so every
 * inquiry reads in the same shape. */
export function inquiryMail(
  submission: InquiryRequest,
  text: SiteMailText,
  common: SharedText,
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
